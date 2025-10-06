import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@shared/kernel/event-bus';
import { DomainEvent } from '@shared/kernel/domain-event';

class PaymentDomainEvent extends DomainEvent {
  constructor(
    public readonly eventType: string,
    public readonly data: any,
    aggregateId: string = 'payment'
  ) {
    super(aggregateId);
  }

  getEventName(): string {
    return this.eventType;
  }
}

export interface PaymentProvider {
  name: string;
  initialize(config: any): Promise<void>;
  createPayment(request: PaymentRequest): Promise<PaymentResponse>;
  capturePayment(paymentId: string, amount?: number): Promise<PaymentResponse>;
  refundPayment(paymentId: string, amount?: number, reason?: string): Promise<RefundResponse>;
  voidPayment(paymentId: string): Promise<PaymentResponse>;
  getPayment(paymentId: string): Promise<PaymentResponse>;
  verifyWebhook(payload: any, signature: string): boolean;
  processWebhookEvent(payload: any): PaymentWebhookEvent[];
  supports(feature: PaymentFeature): boolean;
}

export interface PaymentRequest {
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  customer?: Customer;
  billing?: BillingAddress;
  shipping?: ShippingAddress;
  metadata?: Record<string, any>;
  description?: string;
  statementDescriptor?: string;
  returnUrl?: string;
  cancelUrl?: string;
  webhookUrl?: string;
  idempotencyKey?: string;
  captureMethod?: 'automatic' | 'manual';
  confirmationMethod?: 'automatic' | 'manual';
  setupFutureUsage?: 'on_session' | 'off_session';
}

export interface PaymentMethod {
  type: 'card' | 'bank_account' | 'digital_wallet' | 'crypto' | 'bnpl';
  card?: {
    number?: string;
    expiryMonth?: number;
    expiryYear?: number;
    cvc?: string;
    token?: string;
  };
  bankAccount?: {
    accountNumber?: string;
    routingNumber?: string;
    accountType?: 'checking' | 'savings';
    token?: string;
  };
  digitalWallet?: {
    provider: 'apple_pay' | 'google_pay' | 'samsung_pay' | 'paypal';
    token: string;
  };
  crypto?: {
    currency: 'BTC' | 'ETH' | 'USDC' | 'USDT';
    address?: string;
  };
  bnpl?: {
    provider: 'klarna' | 'afterpay' | 'affirm' | 'sezzle';
  };
}

export interface Customer {
  id?: string;
  email?: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, any>;
}

export interface BillingAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export interface ShippingAddress extends BillingAddress {
  name?: string;
}

export interface PaymentResponse {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  capturedAmount?: number;
  refundedAmount?: number;
  fees?: PaymentFees;
  paymentMethod?: PaymentMethod;
  customer?: Customer;
  created: Date;
  updated?: Date;
  metadata?: Record<string, any>;
  gatewayResponse?: any;
  errorCode?: string;
  errorMessage?: string;
  nextAction?: PaymentNextAction;
}

export interface RefundResponse {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  reason?: string;
  created: Date;
  metadata?: Record<string, any>;
}

export interface PaymentFees {
  total: number;
  gateway: number;
  processing: number;
  interchange?: number;
  currency: string;
}

export interface PaymentNextAction {
  type: 'redirect_to_url' | 'use_stripe_sdk' | 'display_otp_form' | 'verify_with_microdeposits';
  redirectUrl?: string;
  instructions?: string;
  data?: any;
}

export interface PaymentWebhookEvent {
  id: string;
  type: string;
  paymentId?: string;
  customerId?: string;
  data: any;
  created: Date;
}

export type PaymentStatus = 
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded'
  | 'failed';

export type PaymentFeature = 
  | 'recurring_payments'
  | 'marketplace'
  | 'multi_party'
  | 'refunds'
  | 'partial_refunds'
  | 'disputes'
  | 'fraud_protection'
  | 'tokenization'
  | 'webhooks'
  | 'customer_management'
  | 'reporting'
  | 'compliance'
  | 'mobile_payments'
  | 'international'
  | 'cryptocurrency'
  | 'bnpl';

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);
  private readonly providers = new Map<string, PaymentProvider>();
  private readonly providerPriority: string[];
  private readonly fallbackProviders: string[];

  constructor(
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus,
  ) {
    this.providerPriority = this.configService.get('PAYMENT_PROVIDER_PRIORITY', 'stripe,razorpay,paypal').split(',');
    this.fallbackProviders = this.configService.get('PAYMENT_FALLBACK_PROVIDERS', 'paypal,square').split(',');
    this.initializeProviders();
  }

  /**
   * Process payment with intelligent provider selection and fallback
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    const selectedProvider = this.selectProvider(request);
    let lastError: Error | null = null;

    // Try primary provider
    try {
      this.logger.log(`Processing payment with provider: ${selectedProvider}`);
      const response = await this.providers.get(selectedProvider)!.createPayment(request);
      
      await this.recordPaymentEvent('payment.created', response, selectedProvider);
      return response;

    } catch (error) {
      this.logger.warn(`Payment failed with ${selectedProvider}: ${error.message}`);
      lastError = error;
      
      await this.recordPaymentError(selectedProvider, error, request);
    }

    // Try fallback providers
    for (const fallbackProvider of this.fallbackProviders) {
      if (fallbackProvider === selectedProvider) continue;
      
      const provider = this.providers.get(fallbackProvider);
      if (!provider) continue;

      try {
        this.logger.log(`Attempting fallback with provider: ${fallbackProvider}`);
        const response = await provider.createPayment(request);
        
        await this.recordPaymentEvent('payment.created', response, fallbackProvider);
        await this.recordPaymentFallback(selectedProvider, fallbackProvider, request);
        
        return response;

      } catch (error) {
        this.logger.warn(`Fallback failed with ${fallbackProvider}: ${error.message}`);
        lastError = error;
      }
    }

    // All providers failed
    this.logger.error('All payment providers failed');
    await this.recordPaymentFailure(request, lastError);
    
    throw new BadRequestException(
      `Payment processing failed: ${lastError?.message || 'All providers unavailable'}`
    );
  }

  /**
   * Capture authorized payment
   */
  async capturePayment(paymentId: string, amount?: number): Promise<PaymentResponse> {
    const provider = await this.getProviderForPayment(paymentId);
    
    try {
      const response = await provider.capturePayment(paymentId, amount);
      await this.recordPaymentEvent('payment.captured', response, provider.name);
      return response;

    } catch (error) {
      this.logger.error(`Payment capture failed: ${error.message}`);
      throw new BadRequestException(`Payment capture failed: ${error.message}`);
    }
  }

  /**
   * Refund payment with advanced refund management
   */
  async refundPayment(
    paymentId: string, 
    amount?: number, 
    reason?: string,
    metadata?: Record<string, any>
  ): Promise<RefundResponse> {
    const provider = await this.getProviderForPayment(paymentId);
    
    try {
      // Validate refund eligibility
      const payment = await provider.getPayment(paymentId);
      await this.validateRefundEligibility(payment, amount);

      const response = await provider.refundPayment(paymentId, amount, reason);
      
      await this.recordRefundEvent(response, provider.name, metadata);
      return response;

    } catch (error) {
      this.logger.error(`Payment refund failed: ${error.message}`);
      throw new BadRequestException(`Payment refund failed: ${error.message}`);
    }
  }

  /**
   * Process webhook events with signature verification
   */
  async processWebhookEvent(
    providerName: string,
    payload: any,
    signature: string,
    headers?: Record<string, string>
  ): Promise<void> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new BadRequestException(`Unknown payment provider: ${providerName}`);
    }

    try {
      // Verify webhook signature
      if (!provider.verifyWebhook(payload, signature)) {
        throw new BadRequestException('Invalid webhook signature');
      }

      // Process webhook events
      const events = provider.processWebhookEvent(payload);
      
      for (const event of events) {
        await this.handleWebhookEvent(event, providerName);
      }

      this.logger.log(`Processed ${events.length} webhook events from ${providerName}`);

    } catch (error) {
      this.logger.error(`Webhook processing failed for ${providerName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get payment details with provider abstraction
   */
  async getPayment(paymentId: string): Promise<PaymentResponse> {
    const provider = await this.getProviderForPayment(paymentId);
    return provider.getPayment(paymentId);
  }

  /**
   * Get comprehensive payment analytics
   */
  async getPaymentAnalytics(options: {
    startDate: Date;
    endDate: Date;
    provider?: string;
    currency?: string;
    status?: PaymentStatus;
  }): Promise<{
    totalVolume: number;
    totalTransactions: number;
    successRate: number;
    averageAmount: number;
    providerBreakdown: Record<string, {
      volume: number;
      transactions: number;
      successRate: number;
      fees: number;
    }>;
    currencyBreakdown: Record<string, number>;
    statusBreakdown: Record<PaymentStatus, number>;
    dailyVolume: Array<{ date: string; volume: number; transactions: number }>;
    topFailureReasons: Array<{ reason: string; count: number }>;
    fraudDetectionStats: {
      flagged: number;
      blocked: number;
      falsePositives: number;
    };
  }> {
    // Implementation would aggregate data from payment storage
    // This is a comprehensive analytics structure for enterprise reporting
    return {
      totalVolume: 0,
      totalTransactions: 0,
      successRate: 0,
      averageAmount: 0,
      providerBreakdown: {},
      currencyBreakdown: {},
      statusBreakdown: {} as any,
      dailyVolume: [],
      topFailureReasons: [],
      fraudDetectionStats: {
        flagged: 0,
        blocked: 0,
        falsePositives: 0,
      },
    };
  }

  /**
   * Intelligent provider selection based on request characteristics
   */
  private selectProvider(request: PaymentRequest): string {
    // Provider selection logic based on:
    // 1. Currency support
    // 2. Payment method type
    // 3. Transaction amount
    // 4. Geographic region
    // 5. Feature requirements
    // 6. Provider performance metrics
    // 7. Cost optimization

    const selectionCriteria = {
      currency: request.currency,
      amount: request.amount,
      paymentMethod: request.paymentMethod.type,
      features: this.getRequiredFeatures(request),
    };

    // Score each provider
    const providerScores = new Map<string, number>();

    for (const [providerName, provider] of this.providers) {
      let score = 0;

      // Currency support (highest priority)
      if (this.providerSupportsCurrency(providerName, request.currency)) {
        score += 100;
      } else {
        continue; // Skip if currency not supported
      }

      // Payment method support
      if (this.providerSupportsPaymentMethod(providerName, request.paymentMethod.type)) {
        score += 50;
      }

      // Amount-based optimization
      score += this.getAmountScore(providerName, request.amount);

      // Feature support
      score += this.getFeatureScore(provider, selectionCriteria.features);

      // Performance metrics
      score += this.getPerformanceScore(providerName);

      // Cost optimization
      score += this.getCostScore(providerName, request.amount);

      providerScores.set(providerName, score);
    }

    // Select highest scoring provider
    const sortedProviders = Array.from(providerScores.entries())
      .sort(([, a], [, b]) => b - a);

    if (sortedProviders.length === 0) {
      throw new BadRequestException('No suitable payment provider found');
    }

    return sortedProviders[0][0];
  }

  /**
   * Initialize all configured payment providers
   */
  private async initializeProviders(): Promise<void> {
    const enabledProviders = this.configService.get('PAYMENT_PROVIDERS', 'stripe,razorpay,paypal').split(',');

    for (const providerName of enabledProviders) {
      try {
        const provider = await this.createProvider(providerName);
        if (provider) {
          await provider.initialize(this.getProviderConfig(providerName));
          this.providers.set(providerName, provider);
          this.logger.log(`Initialized payment provider: ${providerName}`);
        }
      } catch (error) {
        this.logger.error(`Failed to initialize provider ${providerName}: ${error.message}`);
      }
    }

    if (this.providers.size === 0) {
      throw new Error('No payment providers could be initialized');
    }
  }

  /**
   * Create provider instance based on configuration
   */
  private async createProvider(providerName: string): Promise<PaymentProvider | null> {
    switch (providerName.toLowerCase()) {
      case 'stripe':
        const { StripeProvider } = await import('./providers/stripe.provider');
        return new StripeProvider();
      
      case 'razorpay':
        const { RazorpayProvider } = await import('./providers/razorpay.provider');
        return new RazorpayProvider();
      
      case 'paypal':
        const { PayPalProvider } = await import('./providers/paypal.provider');
        return new PayPalProvider();
      
      case 'square':
        const { SquareProvider } = await import('./providers/square.provider');
        return new SquareProvider();
      
      case 'adyen':
        const { AdyenProvider } = await import('./providers/adyen.provider');
        return new AdyenProvider();
      
      default:
        this.logger.warn(`Unknown payment provider: ${providerName}`);
        return null;
    }
  }

  /**
   * Provider scoring methods
   */
  private providerSupportsCurrency(providerName: string, currency: string): boolean {
    const currencySupport: Record<string, string[]> = {
      stripe: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR'],
      razorpay: ['INR', 'USD'],
      paypal: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
      square: ['USD', 'CAD', 'AUD', 'GBP', 'JPY'],
      adyen: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR', 'SGD'],
    };

    return currencySupport[providerName]?.includes(currency) || false;
  }

  private providerSupportsPaymentMethod(providerName: string, paymentMethod: string): boolean {
    const methodSupport: Record<string, string[]> = {
      stripe: ['card', 'bank_account', 'digital_wallet'],
      razorpay: ['card', 'bank_account', 'digital_wallet'],
      paypal: ['digital_wallet', 'bank_account'],
      square: ['card', 'digital_wallet'],
      adyen: ['card', 'bank_account', 'digital_wallet', 'bnpl'],
    };

    return methodSupport[providerName]?.includes(paymentMethod) || false;
  }

  private getAmountScore(providerName: string, amount: number): number {
    // Optimize provider selection based on transaction amount
    // Some providers are better for small/large transactions
    const providerOptimization: Record<string, { min: number; max: number; multiplier: number }> = {
      stripe: { min: 50, max: 999999, multiplier: 1.0 },
      razorpay: { min: 100, max: 999999, multiplier: 1.1 },
      paypal: { min: 1, max: 10000, multiplier: 0.9 },
      square: { min: 1, max: 50000, multiplier: 1.0 },
      adyen: { min: 1000, max: 999999, multiplier: 1.2 },
    };

    const config = providerOptimization[providerName];
    if (!config) return 0;

    if (amount >= config.min && amount <= config.max) {
      return 20 * config.multiplier;
    }

    return amount < config.min ? 5 : 10;
  }

  private getFeatureScore(provider: PaymentProvider, features: PaymentFeature[]): number {
    let score = 0;
    for (const feature of features) {
      if (provider.supports(feature)) {
        score += 10;
      }
    }
    return score;
  }

  private getPerformanceScore(providerName: string): number {
    // This would be based on real-time performance metrics
    // Success rates, response times, uptime, etc.
    const performanceMetrics: Record<string, number> = {
      stripe: 95,
      razorpay: 92,
      paypal: 88,
      square: 90,
      adyen: 94,
    };

    return (performanceMetrics[providerName] || 85) / 10;
  }

  private getCostScore(providerName: string, amount: number): number {
    // Calculate cost efficiency score based on provider fees
    // This would use real fee structures
    const feeStructures: Record<string, { fixed: number; percentage: number }> = {
      stripe: { fixed: 30, percentage: 2.9 },
      razorpay: { fixed: 0, percentage: 2.0 },
      paypal: { fixed: 30, percentage: 3.4 },
      square: { fixed: 10, percentage: 2.6 },
      adyen: { fixed: 11, percentage: 2.2 },
    };

    const fees = feeStructures[providerName];
    if (!fees) return 0;

    const totalFee = fees.fixed + (amount * fees.percentage / 100);
    const feePercentage = (totalFee / amount) * 100;

    // Lower fees = higher score
    return Math.max(0, 30 - feePercentage * 10);
  }

  private getRequiredFeatures(request: PaymentRequest): PaymentFeature[] {
    const features: PaymentFeature[] = ['webhooks'];

    if (request.setupFutureUsage) {
      features.push('tokenization', 'recurring_payments');
    }

    if (request.paymentMethod.type === 'digital_wallet') {
      features.push('mobile_payments');
    }

    if (request.paymentMethod.type === 'crypto') {
      features.push('cryptocurrency');
    }

    if (request.paymentMethod.type === 'bnpl') {
      features.push('bnpl');
    }

    return features;
  }

  /**
   * Event handling and tracking methods
   */
  private async recordPaymentEvent(
    eventType: string,
    response: PaymentResponse,
    providerName: string
  ): Promise<void> {
    const event = new PaymentDomainEvent(eventType, {
      paymentId: response.id,
      provider: providerName,
      amount: response.amount,
      currency: response.currency,
      status: response.status,
      timestamp: new Date(),
    });

    await this.eventBus.publish(event);
  }

  private async recordPaymentError(
    providerName: string,
    error: Error,
    request: PaymentRequest
  ): Promise<void> {
    // Record error metrics for monitoring and alerting
    this.logger.error(`Payment error with ${providerName}:`, {
      error: error.message,
      amount: request.amount,
      currency: request.currency,
      paymentMethod: request.paymentMethod.type,
    });
  }

  private async recordPaymentFallback(
    failedProvider: string,
    successProvider: string,
    request: PaymentRequest
  ): Promise<void> {
    // Record fallback events for analysis
    this.logger.log(`Payment fallback: ${failedProvider} -> ${successProvider}`);
  }

  private async recordPaymentFailure(request: PaymentRequest, error: Error | null): Promise<void> {
    // Record complete payment failure
    this.logger.error('Payment processing completely failed', {
      error: error?.message,
      request: {
        amount: request.amount,
        currency: request.currency,
        paymentMethod: request.paymentMethod.type,
      },
    });
  }

  private async recordRefundEvent(
    response: RefundResponse,
    providerName: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const event = new PaymentDomainEvent('refund.created', {
      refundId: response.id,
      paymentId: response.paymentId,
      provider: providerName,
      amount: response.amount,
      currency: response.currency,
      status: response.status,
      metadata,
      timestamp: new Date(),
    });

    await this.eventBus.publish(event);
  }

  private async handleWebhookEvent(event: PaymentWebhookEvent, providerName: string): Promise<void> {
    // Process different types of webhook events
    switch (event.type) {
      case 'payment.succeeded':
      case 'payment.failed':
      case 'payment.canceled':
        await this.handlePaymentStatusChange(event, providerName);
        break;
      
      case 'refund.succeeded':
      case 'refund.failed':
        await this.handleRefundStatusChange(event, providerName);
        break;
      
      case 'dispute.created':
      case 'dispute.funds_withdrawn':
      case 'dispute.funds_reinstated':
        await this.handleDisputeEvent(event, providerName);
        break;
      
      default:
        this.logger.log(`Unhandled webhook event type: ${event.type}`);
    }
  }

  private async handlePaymentStatusChange(event: PaymentWebhookEvent, providerName: string): Promise<void> {
    // Update payment status and trigger business logic
    const domainEvent = new PaymentDomainEvent(event.type, {
      paymentId: event.paymentId,
      provider: providerName,
      data: event.data,
      timestamp: event.created,
    });

    await this.eventBus.publish(domainEvent);
  }

  private async handleRefundStatusChange(event: PaymentWebhookEvent, providerName: string): Promise<void> {
    // Handle refund status updates
    const domainEvent = new PaymentDomainEvent(event.type, {
      paymentId: event.paymentId,
      provider: providerName,
      data: event.data,
      timestamp: event.created,
    });

    await this.eventBus.publish(domainEvent);
  }

  private async handleDisputeEvent(event: PaymentWebhookEvent, providerName: string): Promise<void> {
    // Handle dispute and chargeback events
    const domainEvent = new PaymentDomainEvent(event.type, {
      paymentId: event.paymentId,
      provider: providerName,
      data: event.data,
      timestamp: event.created,
    });

    await this.eventBus.publish(domainEvent);
  }

  private async getProviderForPayment(paymentId: string): Promise<PaymentProvider> {
    // This would typically lookup the payment in database to determine which provider was used
    // For now, try each provider until we find the payment
    for (const [providerName, provider] of this.providers) {
      try {
        await provider.getPayment(paymentId);
        return provider;
      } catch (error) {
        // Payment not found with this provider, continue
      }
    }

    throw new BadRequestException(`Payment not found: ${paymentId}`);
  }

  private async validateRefundEligibility(payment: PaymentResponse, amount?: number): Promise<void> {
    if (payment.status !== 'succeeded') {
      throw new BadRequestException('Payment must be succeeded to refund');
    }

    if (amount && amount > payment.amount) {
      throw new BadRequestException('Refund amount cannot exceed payment amount');
    }

    const availableAmount = payment.amount - (payment.refundedAmount || 0);
    if (amount && amount > availableAmount) {
      throw new BadRequestException('Refund amount exceeds available amount');
    }
  }

  private getProviderConfig(providerName: string): any {
    return {
      apiKey: this.configService.get(`${providerName.toUpperCase()}_API_KEY`),
      secretKey: this.configService.get(`${providerName.toUpperCase()}_SECRET_KEY`),
      webhookSecret: this.configService.get(`${providerName.toUpperCase()}_WEBHOOK_SECRET`),
      environment: this.configService.get(`${providerName.toUpperCase()}_ENVIRONMENT`, 'sandbox'),
      ...this.configService.get(`${providerName.toUpperCase()}_CONFIG`, {}),
    };
  }
}
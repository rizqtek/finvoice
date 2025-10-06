import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { 
  PaymentProvider, 
  PaymentRequest, 
  PaymentResponse, 
  PaymentMethod,
  RefundResponse,
  PaymentWebhookEvent,
  PaymentFeature,
  PaymentStatus,
  Customer,
  BillingAddress
} from '../payment-gateway.service';

@Injectable()
export class StripeProvider implements PaymentProvider {
  public readonly name = 'stripe';
  private readonly logger = new Logger(StripeProvider.name);
  private stripe: Stripe;
  private webhookSecret: string;

  async initialize(config: any): Promise<void> {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2023-08-16',
      typescript: true,
      telemetry: false,
    });
    
    this.webhookSecret = config.webhookSecret;
    this.logger.log('Stripe provider initialized');
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      // Create or retrieve customer
      const customer = await this.handleCustomer(request.customer);
      
      // Create payment method if needed
      const paymentMethod = await this.handlePaymentMethod(request.paymentMethod, customer?.id);
      
      // Create payment intent
      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: Math.round(request.amount * 100), // Convert to cents
        currency: request.currency.toLowerCase(),
        customer: customer?.id,
        payment_method: paymentMethod?.id,
        description: request.description,
        statement_descriptor: request.statementDescriptor?.substring(0, 22),
        metadata: {
          ...request.metadata,
          source: 'finvoice',
          idempotency_key: request.idempotencyKey || null,
        },
        confirmation_method: request.confirmationMethod || 'automatic',
        capture_method: request.captureMethod || 'automatic',
        setup_future_usage: request.setupFutureUsage,
        return_url: request.returnUrl,
      };

      // Add shipping information if provided
      if (request.shipping) {
        paymentIntentParams.shipping = {
          name: request.shipping.name || customer?.name || 'Customer',
          address: {
            line1: request.shipping.line1,
            line2: request.shipping.line2,
            city: request.shipping.city,
            state: request.shipping.state,
            postal_code: request.shipping.postalCode,
            country: request.shipping.country,
          },
        };
      }

      // Automatic payment methods for digital wallets
      if (request.paymentMethod.type === 'digital_wallet') {
        paymentIntentParams.automatic_payment_methods = {
          enabled: true,
          allow_redirects: 'always',
        };
      }

      // Risk assessment and fraud protection
      paymentIntentParams.radar_options = {
        session: this.generateRadarSession(request),
      };

      const paymentIntent = await this.stripe.paymentIntents.create(
        paymentIntentParams,
        {
          idempotencyKey: request.idempotencyKey,
        }
      );

      // Confirm payment if automatic confirmation
      let finalPaymentIntent = paymentIntent;
      if (
        request.confirmationMethod === 'automatic' && 
        paymentIntent.status === 'requires_confirmation'
      ) {
        finalPaymentIntent = await this.stripe.paymentIntents.confirm(
          paymentIntent.id,
          {
            return_url: request.returnUrl,
          }
        );
      }

      return this.mapStripePaymentToResponse(finalPaymentIntent);

    } catch (error) {
      this.logger.error(`Stripe payment creation failed: ${error.message}`);
      throw this.mapStripeError(error);
    }
  }

  async capturePayment(paymentId: string, amount?: number): Promise<PaymentResponse> {
    try {
      const captureParams: any = {};
      if (amount) {
        captureParams.amount_to_capture = Math.round(amount * 100);
      }

      const paymentIntent = await this.stripe.paymentIntents.capture(
        paymentId,
        captureParams
      );

      return this.mapStripePaymentToResponse(paymentIntent);

    } catch (error) {
      this.logger.error(`Stripe payment capture failed: ${error.message}`);
      throw this.mapStripeError(error);
    }
  }

  async refundPayment(
    paymentId: string, 
    amount?: number, 
    reason?: string
  ): Promise<RefundResponse> {
    try {
      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: paymentId,
        reason: this.mapRefundReason(reason),
        metadata: {
          source: 'finvoice',
          timestamp: new Date().toISOString(),
        },
      };

      if (amount) {
        refundParams.amount = Math.round(amount * 100);
      }

      const refund = await this.stripe.refunds.create(refundParams);

      return {
        id: refund.id,
        paymentId: refund.payment_intent as string,
        amount: refund.amount / 100,
        currency: refund.currency.toUpperCase(),
        status: this.mapRefundStatus(refund.status || 'failed'),
        reason,
        created: new Date(refund.created * 1000),
        metadata: refund.metadata || undefined,
      };

    } catch (error) {
      this.logger.error(`Stripe refund failed: ${error.message}`);
      throw this.mapStripeError(error);
    }
  }

  async voidPayment(paymentId: string): Promise<PaymentResponse> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.cancel(paymentId);
      return this.mapStripePaymentToResponse(paymentIntent);

    } catch (error) {
      this.logger.error(`Stripe payment void failed: ${error.message}`);
      throw this.mapStripeError(error);
    }
  }

  async getPayment(paymentId: string): Promise<PaymentResponse> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentId, {
        expand: ['payment_method', 'customer', 'latest_charge'],
      });

      return this.mapStripePaymentToResponse(paymentIntent);

    } catch (error) {
      this.logger.error(`Stripe payment retrieval failed: ${error.message}`);
      throw this.mapStripeError(error);
    }
  }

  verifyWebhook(payload: any, signature: string): boolean {
    try {
      this.stripe.webhooks.constructEvent(
        JSON.stringify(payload),
        signature,
        this.webhookSecret
      );
      return true;

    } catch (error) {
      this.logger.warn(`Stripe webhook verification failed: ${error.message}`);
      return false;
    }
  }

  processWebhookEvent(payload: any): PaymentWebhookEvent[] {
    try {
      const events: PaymentWebhookEvent[] = [];
      
      // Stripe sends single events, but we return array for consistency
      const event = payload as Stripe.Event;
      
      const webhookEvent: PaymentWebhookEvent = {
        id: event.id,
        type: this.mapStripeEventType(event.type),
        created: new Date(event.created * 1000),
        data: event.data.object,
      };

      // Extract payment ID based on event type
      const eventObject = event.data.object as any;
      if (eventObject.object === 'payment_intent') {
        webhookEvent.paymentId = eventObject.id;
      } else if (eventObject.object === 'charge') {
        webhookEvent.paymentId = eventObject.payment_intent;
      } else if (eventObject.object === 'refund') {
        webhookEvent.paymentId = eventObject.payment_intent;
      }

      // Extract customer ID if available
      if ((event.data.object as any).customer) {
        webhookEvent.customerId = (event.data.object as any).customer;
      }

      events.push(webhookEvent);
      return events;

    } catch (error) {
      this.logger.error(`Stripe webhook event processing failed: ${error.message}`);
      return [];
    }
  }

  supports(feature: PaymentFeature): boolean {
    const supportedFeatures: PaymentFeature[] = [
      'recurring_payments',
      'marketplace',
      'multi_party',
      'refunds',
      'partial_refunds',
      'disputes',
      'fraud_protection',
      'tokenization',
      'webhooks',
      'customer_management',
      'reporting',
      'compliance',
      'mobile_payments',
      'international',
    ];

    return supportedFeatures.includes(feature);
  }

  /**
   * Advanced customer handling with deduplication and enrichment
   */
  private async handleCustomer(customerData?: Customer): Promise<Stripe.Customer | null> {
    if (!customerData) return null;

    try {
      // Try to find existing customer by email or ID
      if (customerData.id) {
        return await this.stripe.customers.retrieve(customerData.id) as Stripe.Customer;
      }

      if (customerData.email) {
        const existingCustomers = await this.stripe.customers.list({
          email: customerData.email,
          limit: 1,
        });

        if (existingCustomers.data.length > 0) {
          return existingCustomers.data[0];
        }
      }

      // Create new customer
      const customerParams: Stripe.CustomerCreateParams = {
        email: customerData.email,
        name: customerData.name,
        phone: customerData.phone,
        metadata: {
          ...customerData.metadata,
          source: 'finvoice',
          created_at: new Date().toISOString(),
        },
      };

      return await this.stripe.customers.create(customerParams);

    } catch (error) {
      this.logger.warn(`Customer handling failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Advanced payment method handling with tokenization
   */
  private async handlePaymentMethod(
    paymentMethodData: PaymentMethod, 
    customerId?: string
  ): Promise<Stripe.PaymentMethod | null> {
    try {
      switch (paymentMethodData.type) {
        case 'card':
          return await this.handleCardPaymentMethod(paymentMethodData, customerId);
        
        case 'bank_account':
          return await this.handleBankAccountPaymentMethod(paymentMethodData, customerId);
        
        case 'digital_wallet':
          return await this.handleDigitalWalletPaymentMethod(paymentMethodData, customerId);
        
        default:
          return null;
      }

    } catch (error) {
      this.logger.warn(`Payment method handling failed: ${error.message}`);
      return null;
    }
  }

  private async handleCardPaymentMethod(
    paymentMethodData: PaymentMethod,
    customerId?: string
  ): Promise<Stripe.PaymentMethod | null> {
    if (paymentMethodData.card?.token) {
      // Use existing payment method token
      const paymentMethod = await this.stripe.paymentMethods.retrieve(
        paymentMethodData.card.token
      );
      
      if (customerId && !paymentMethod.customer) {
        await this.stripe.paymentMethods.attach(paymentMethod.id, {
          customer: customerId,
        });
      }
      
      return paymentMethod;
    }

    if (paymentMethodData.card?.number) {
      // Create new payment method from card details
      const paymentMethodParams: Stripe.PaymentMethodCreateParams = {
        type: 'card',
        card: {
          number: paymentMethodData.card.number,
          exp_month: paymentMethodData.card.expiryMonth!,
          exp_year: paymentMethodData.card.expiryYear!,
          cvc: paymentMethodData.card.cvc,
        },
      };

      const paymentMethod = await this.stripe.paymentMethods.create(paymentMethodParams);

      if (customerId) {
        await this.stripe.paymentMethods.attach(paymentMethod.id, {
          customer: customerId,
        });
      }

      return paymentMethod;
    }

    return null;
  }

  private async handleBankAccountPaymentMethod(
    paymentMethodData: PaymentMethod,
    customerId?: string
  ): Promise<Stripe.PaymentMethod | null> {
    if (paymentMethodData.bankAccount?.token) {
      return await this.stripe.paymentMethods.retrieve(
        paymentMethodData.bankAccount.token
      );
    }

    // For ACH/bank transfers, we typically use Sources or Setup Intents
    // This is a simplified implementation
    return null;
  }

  private async handleDigitalWalletPaymentMethod(
    paymentMethodData: PaymentMethod,
    customerId?: string
  ): Promise<Stripe.PaymentMethod | null> {
    if (paymentMethodData.digitalWallet?.token) {
      return await this.stripe.paymentMethods.retrieve(
        paymentMethodData.digitalWallet.token
      );
    }

    // Digital wallet payment methods are typically created on the frontend
    // and passed as tokens
    return null;
  }

  /**
   * Advanced fraud protection and risk assessment
   */
  private generateRadarSession(request: PaymentRequest): string {
    // Generate Radar session for fraud protection
    const sessionData = {
      user_agent: 'Finvoice/1.0',
      ip_address: '127.0.0.1', // This should come from request
      timestamp: Date.now(),
      amount: request.amount,
      currency: request.currency,
    };

    return btoa(JSON.stringify(sessionData));
  }

  /**
   * Comprehensive error mapping and handling
   */
  private mapStripeError(error: any): Error {
    if (error.type === 'StripeCardError') {
      return new Error(`Card Error: ${error.message}`);
    }
    
    if (error.type === 'StripeInvalidRequestError') {
      return new Error(`Invalid Request: ${error.message}`);
    }
    
    if (error.type === 'StripeAPIError') {
      return new Error(`Stripe API Error: ${error.message}`);
    }
    
    if (error.type === 'StripeConnectionError') {
      return new Error(`Connection Error: ${error.message}`);
    }
    
    if (error.type === 'StripeAuthenticationError') {
      return new Error(`Authentication Error: ${error.message}`);
    }
    
    if (error.type === 'StripeRateLimitError') {
      return new Error(`Rate Limit Error: ${error.message}`);
    }

    return new Error(`Stripe Error: ${error.message}`);
  }

  /**
   * Response mapping and data transformation
   */
  private mapStripePaymentToResponse(paymentIntent: Stripe.PaymentIntent): PaymentResponse {
    const latestCharge = paymentIntent.latest_charge as Stripe.Charge;
    
    return {
      id: paymentIntent.id,
      status: this.mapStripeStatus(paymentIntent.status),
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
      capturedAmount: paymentIntent.amount_capturable ? 
        (paymentIntent.amount - paymentIntent.amount_capturable) / 100 : 
        undefined,
      refundedAmount: latestCharge?.amount_refunded ? 
        latestCharge.amount_refunded / 100 : 
        undefined,
      fees: latestCharge?.balance_transaction ? {
        total: (latestCharge.balance_transaction as any).fee / 100,
        gateway: (latestCharge.balance_transaction as any).fee / 100,
        processing: 0,
        currency: paymentIntent.currency.toUpperCase(),
      } : undefined,
      paymentMethod: this.mapStripePaymentMethod(paymentIntent.payment_method),
      customer: this.mapStripeCustomer(paymentIntent.customer),
      created: new Date(paymentIntent.created * 1000),
      updated: latestCharge ? new Date(latestCharge.created * 1000) : undefined,
      metadata: paymentIntent.metadata,
      gatewayResponse: {
        payment_intent: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
        next_action: paymentIntent.next_action,
      },
      errorCode: latestCharge?.failure_code || undefined,
      errorMessage: latestCharge?.failure_message || undefined,
      nextAction: paymentIntent.next_action ? {
        type: this.mapStripeNextActionType(paymentIntent.next_action.type),
        redirectUrl: (paymentIntent.next_action as any).redirect_to_url?.url,
        instructions: paymentIntent.next_action.type,
        data: paymentIntent.next_action,
      } : undefined,
    };
  }

  private mapStripeStatus(status: Stripe.PaymentIntent.Status): PaymentStatus {
    const statusMap: Record<Stripe.PaymentIntent.Status, PaymentStatus> = {
      'requires_payment_method': 'requires_payment_method',
      'requires_confirmation': 'requires_confirmation',
      'requires_action': 'requires_action',
      'processing': 'processing',
      'requires_capture': 'requires_capture',
      'canceled': 'canceled',
      'succeeded': 'succeeded',
    };

    return statusMap[status] || 'failed';
  }

  private mapStripePaymentMethod(paymentMethod: any): PaymentMethod | undefined {
    if (!paymentMethod) return undefined;

    const pm = paymentMethod as Stripe.PaymentMethod;
    
    switch (pm.type) {
      case 'card':
        return {
          type: 'card',
          card: {
            token: pm.id,
            expiryMonth: pm.card?.exp_month,
            expiryYear: pm.card?.exp_year,
          },
        };
      
      case 'us_bank_account':
        return {
          type: 'bank_account',
          bankAccount: {
            token: pm.id,
            accountType: pm.us_bank_account?.account_type as any,
          },
        };
      
      default:
        return {
          type: 'card', // Default fallback
        };
    }
  }

  private mapStripeCustomer(customer: any): Customer | undefined {
    if (!customer) return undefined;

    const cust = customer as Stripe.Customer;
    
    return {
      id: cust.id,
      email: cust.email || undefined,
      name: cust.name || undefined,
      phone: cust.phone || undefined,
      metadata: cust.metadata,
    };
  }

  private mapStripeEventType(eventType: string): string {
    const eventMap: Record<string, string> = {
      'payment_intent.succeeded': 'payment.succeeded',
      'payment_intent.payment_failed': 'payment.failed',
      'payment_intent.canceled': 'payment.canceled',
      'payment_intent.requires_action': 'payment.requires_action',
      'payment_intent.processing': 'payment.processing',
      'charge.succeeded': 'payment.succeeded',
      'charge.failed': 'payment.failed',
      'refund.created': 'refund.created',
      'refund.updated': 'refund.updated',
      'dispute.created': 'dispute.created',
      'dispute.funds_withdrawn': 'dispute.funds_withdrawn',
      'dispute.funds_reinstated': 'dispute.funds_reinstated',
    };

    return eventMap[eventType] || eventType;
  }

  private mapStripeNextActionType(type: string): any {
    const typeMap: Record<string, string> = {
      'redirect_to_url': 'redirect_to_url',
      'use_stripe_sdk': 'use_stripe_sdk',
      'verify_with_microdeposits': 'verify_with_microdeposits',
    };

    return typeMap[type] || 'redirect_to_url';
  }

  private mapRefundReason(reason?: string): Stripe.RefundCreateParams.Reason | undefined {
    if (!reason) return undefined;

    const reasonMap: Record<string, Stripe.RefundCreateParams.Reason> = {
      'duplicate': 'duplicate',
      'fraudulent': 'fraudulent',
      'requested_by_customer': 'requested_by_customer',
    };

    return reasonMap[reason.toLowerCase()] || 'requested_by_customer';
  }

  private mapRefundStatus(status: string): 'pending' | 'succeeded' | 'failed' | 'canceled' {
    const statusMap: Record<string, 'pending' | 'succeeded' | 'failed' | 'canceled'> = {
      'pending': 'pending',
      'succeeded': 'succeeded',
      'failed': 'failed',
      'canceled': 'canceled',
    };

    return statusMap[status] || 'failed';
  }
}
import { Controller, Post, Body, Headers, HttpStatus, HttpException, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiHeader } from '@nestjs/swagger';
import { PaymentAggregate } from '../../domain/aggregates/payment.aggregate';
import { EventBus } from '@shared/kernel';
import { createHmac, timingSafeEqual } from 'crypto';

interface StripeWebhookPayload {
  id: string;
  object: string;
  type: string;
  data: {
    object: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      metadata?: {
        invoice_id?: string;
        payment_id?: string;
      };
      payment_intent?: string;
      failure_code?: string;
      failure_message?: string;
    };
  };
}

interface RazorpayWebhookPayload {
  event: string;
  account_id: string;
  entity: string;
  payload: {
    payment: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        status: string;
        notes?: {
          invoice_id?: string;
          payment_id?: string;
        };
        error_code?: string;
        error_description?: string;
      };
    };
  };
}

@ApiTags('Payment Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly eventBus: EventBus
  ) {}

  @Post('stripe')
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  @ApiHeader({ name: 'stripe-signature', description: 'Stripe webhook signature' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature or payload' })
  async handleStripeWebhook(
    @Body() payload: StripeWebhookPayload,
    @Headers('stripe-signature') signature: string,
    @Headers() headers: Record<string, string>
  ) {
    try {
      // Verify Stripe webhook signature
      if (!this.verifyStripeSignature(JSON.stringify(payload), signature)) {
        throw new HttpException('Invalid webhook signature', HttpStatus.UNAUTHORIZED);
      }

      const { type, data } = payload;
      const paymentObject = data.object;

      switch (type) {
        case 'payment_intent.succeeded':
          await this.handleStripePaymentSuccess(paymentObject);
          break;
        case 'payment_intent.payment_failed':
          await this.handleStripePaymentFailed(paymentObject);
          break;
        case 'charge.dispute.created':
          await this.handleStripeDispute(paymentObject);
          break;
        default:
          console.log(`Unhandled Stripe event type: ${type}`);
      }

      return { received: true };
    } catch (error) {
      console.error('Stripe webhook error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Webhook processing failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('razorpay')
  @ApiOperation({ summary: 'Handle Razorpay webhook events' })
  @ApiHeader({ name: 'x-razorpay-signature', description: 'Razorpay webhook signature' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature or payload' })
  async handleRazorpayWebhook(
    @Body() payload: RazorpayWebhookPayload,
    @Headers('x-razorpay-signature') signature: string
  ) {
    try {
      // Verify Razorpay webhook signature
      if (!this.verifyRazorpaySignature(JSON.stringify(payload), signature)) {
        throw new HttpException('Invalid webhook signature', HttpStatus.UNAUTHORIZED);
      }

      const { event, payload: eventPayload } = payload;
      const paymentEntity = eventPayload.payment.entity;

      switch (event) {
        case 'payment.captured':
          await this.handleRazorpayPaymentCaptured(paymentEntity);
          break;
        case 'payment.failed':
          await this.handleRazorpayPaymentFailed(paymentEntity);
          break;
        default:
          console.log(`Unhandled Razorpay event type: ${event}`);
      }

      return { status: 'ok' };
    } catch (error) {
      console.error('Razorpay webhook error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Webhook processing failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('paypal')
  @ApiOperation({ summary: 'Handle PayPal webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async handlePayPalWebhook(@Body() payload: any) {
    try {
      // PayPal webhook verification would go here
      // For now, we'll process the event directly
      
      const { event_type, resource } = payload;

      switch (event_type) {
        case 'PAYMENT.CAPTURE.COMPLETED':
          await this.handlePayPalPaymentCompleted(resource);
          break;
        case 'PAYMENT.CAPTURE.DENIED':
          await this.handlePayPalPaymentDenied(resource);
          break;
        default:
          console.log(`Unhandled PayPal event type: ${event_type}`);
      }

      return { status: 'SUCCESS' };
    } catch (error) {
      console.error('PayPal webhook error:', error);
      throw new HttpException('Webhook processing failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private verifyStripeSignature(payload: string, signature: string): boolean {
    try {
      // TODO: Replace with actual Stripe webhook secret from environment
      const endpointSecret = process?.env?.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';
      
      const elements = signature.split(',');
      const signatureElements = elements.reduce((acc, element) => {
        const [key, value] = element.split('=');
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);

      const timestamp = signatureElements.t;
      const signatures = [signatureElements.v1];

      const expectedSignature = createHmac('sha256', endpointSecret)
        .update(timestamp + '.' + payload)
        .digest('hex');

      return signatures.includes(expectedSignature);
    } catch (error) {
      console.error('Stripe signature verification failed:', error);
      return false;
    }
  }

  private verifyRazorpaySignature(payload: string, signature: string): boolean {
    try {
      // TODO: Replace with actual Razorpay webhook secret from environment
      const webhookSecret = process?.env?.RAZORPAY_WEBHOOK_SECRET || 'razorpay_webhook_secret';
      
      const expectedSignature = createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      return timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('Razorpay signature verification failed:', error);
      return false;
    }
  }

  private async handleStripePaymentSuccess(paymentObject: any): Promise<void> {
    const invoiceId = paymentObject.metadata?.invoice_id;
    const paymentId = paymentObject.metadata?.payment_id;

    if (!invoiceId || !paymentId) {
      console.warn('Missing invoice_id or payment_id in Stripe payment metadata');
      return;
    }

    // TODO: Retrieve payment from repository
    // const payment = await this.paymentRepository.findById(paymentId);
    // if (payment) {
    //   payment.markAsCompleted(paymentObject.id);
    //   await this.paymentRepository.save(payment);
    //   
    //   const events = payment.getUncommittedEvents();
    //   await this.eventBus.publishMany(events);
    //   payment.clearEvents();
    // }

    console.log(`Stripe payment succeeded: ${paymentObject.id} for invoice: ${invoiceId}`);
  }

  private async handleStripePaymentFailed(paymentObject: any): Promise<void> {
    const invoiceId = paymentObject.metadata?.invoice_id;
    const paymentId = paymentObject.metadata?.payment_id;

    if (!invoiceId || !paymentId) {
      console.warn('Missing invoice_id or payment_id in Stripe payment metadata');
      return;
    }

    const failureReason = paymentObject.failure_message || 'Payment failed';
    
    // TODO: Retrieve payment from repository and mark as failed
    console.log(`Stripe payment failed: ${paymentObject.id} for invoice: ${invoiceId}, reason: ${failureReason}`);
  }

  private async handleStripeDispute(disputeObject: any): Promise<void> {
    // Handle Stripe disputes/chargebacks
    console.log(`Stripe dispute created: ${disputeObject.id}`);
  }

  private async handleRazorpayPaymentCaptured(paymentEntity: any): Promise<void> {
    const invoiceId = paymentEntity.notes?.invoice_id;
    const paymentId = paymentEntity.notes?.payment_id;

    if (!invoiceId || !paymentId) {
      console.warn('Missing invoice_id or payment_id in Razorpay payment notes');
      return;
    }

    console.log(`Razorpay payment captured: ${paymentEntity.id} for invoice: ${invoiceId}`);
  }

  private async handleRazorpayPaymentFailed(paymentEntity: any): Promise<void> {
    const invoiceId = paymentEntity.notes?.invoice_id;
    const paymentId = paymentEntity.notes?.payment_id;

    if (!invoiceId || !paymentId) {
      console.warn('Missing invoice_id or payment_id in Razorpay payment notes');
      return;
    }

    const failureReason = paymentEntity.error_description || 'Payment failed';
    console.log(`Razorpay payment failed: ${paymentEntity.id} for invoice: ${invoiceId}, reason: ${failureReason}`);
  }

  private async handlePayPalPaymentCompleted(resource: any): Promise<void> {
    const invoiceId = resource.custom_id; // Assuming PayPal custom_id contains invoice ID
    
    if (!invoiceId) {
      console.warn('Missing invoice_id in PayPal payment resource');
      return;
    }

    console.log(`PayPal payment completed: ${resource.id} for invoice: ${invoiceId}`);
  }

  private async handlePayPalPaymentDenied(resource: any): Promise<void> {
    const invoiceId = resource.custom_id;
    
    if (!invoiceId) {
      console.warn('Missing invoice_id in PayPal payment resource');
      return;
    }

    console.log(`PayPal payment denied: ${resource.id} for invoice: ${invoiceId}`);
  }
}
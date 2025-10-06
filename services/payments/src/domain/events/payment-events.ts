import { DomainEvent } from '@shared/kernel';

export class PaymentProcessedEvent extends DomainEvent {
  constructor(
    public readonly paymentId: string,
    public readonly invoiceId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly paymentMethod: string,
    public readonly gatewayTransactionId: string
  ) {
    super(paymentId);
  }

  getEventName(): string {
    return 'PaymentProcessed';
  }
}

export class PaymentFailedEvent extends DomainEvent {
  constructor(
    public readonly paymentId: string,
    public readonly invoiceId: string,
    public readonly reason: string,
    public readonly gatewayError?: string
  ) {
    super(paymentId);
  }

  getEventName(): string {
    return 'PaymentFailed';
  }
}

export class PaymentRefundedEvent extends DomainEvent {
  constructor(
    public readonly paymentId: string,
    public readonly refundAmount: number,
    public readonly reason: string
  ) {
    super(paymentId);
  }

  getEventName(): string {
    return 'PaymentRefunded';
  }
}
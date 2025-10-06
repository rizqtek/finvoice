import { AggregateRoot, DomainException } from '@shared/kernel';
import { PaymentStatus, PaymentMethod } from '../value-objects/enums';
import { PaymentProcessedEvent, PaymentFailedEvent, PaymentRefundedEvent } from '../events/payment-events';

interface PaymentProps {
  invoiceId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  gatewayTransactionId?: string;
  gatewayPaymentId?: string;
  processedAt?: Date;
  failureReason?: string;
  refundedAmount?: number;
  refundedAt?: Date;
  metadata?: Record<string, any>;
}

export class PaymentAggregate extends AggregateRoot {
  private constructor(
    private props: PaymentProps,
    id?: string
  ) {
    super(id);
  }

  static create(
    invoiceId: string,
    amount: number,
    currency: string,
    paymentMethod: PaymentMethod,
    gatewayPaymentId?: string,
    metadata?: Record<string, any>
  ): PaymentAggregate {
    if (!invoiceId || invoiceId.trim().length === 0) {
      throw new DomainException('Invoice ID cannot be empty');
    }
    if (amount <= 0) {
      throw new DomainException('Payment amount must be positive');
    }
    if (!currency || currency.length !== 3) {
      throw new DomainException('Currency must be a valid 3-letter code');
    }

    return new PaymentAggregate({
      invoiceId: invoiceId.trim(),
      amount,
      currency: currency.toUpperCase(),
      paymentMethod,
      status: PaymentStatus.PENDING,
      gatewayPaymentId,
      metadata
    });
  }

  static fromPersistence(props: PaymentProps, id: string): PaymentAggregate {
    return new PaymentAggregate(props, id);
  }

  // Getters
  get invoiceId(): string {
    return this.props.invoiceId;
  }

  get amount(): number {
    return this.props.amount;
  }

  get currency(): string {
    return this.props.currency;
  }

  get paymentMethod(): PaymentMethod {
    return this.props.paymentMethod;
  }

  get status(): PaymentStatus {
    return this.props.status;
  }

  get gatewayTransactionId(): string | undefined {
    return this.props.gatewayTransactionId;
  }

  get gatewayPaymentId(): string | undefined {
    return this.props.gatewayPaymentId;
  }

  get processedAt(): Date | undefined {
    return this.props.processedAt;
  }

  get failureReason(): string | undefined {
    return this.props.failureReason;
  }

  get refundedAmount(): number | undefined {
    return this.props.refundedAmount;
  }

  get refundedAt(): Date | undefined {
    return this.props.refundedAt;
  }

  get metadata(): Record<string, any> | undefined {
    return this.props.metadata;
  }

  // Business methods
  markAsProcessing(): void {
    if (this.props.status !== PaymentStatus.PENDING) {
      throw new DomainException('Only pending payments can be marked as processing');
    }
    this.props.status = PaymentStatus.PROCESSING;
  }

  markAsCompleted(gatewayTransactionId: string): void {
    if (this.props.status !== PaymentStatus.PROCESSING && this.props.status !== PaymentStatus.PENDING) {
      throw new DomainException('Only pending or processing payments can be marked as completed');
    }
    if (!gatewayTransactionId || gatewayTransactionId.trim().length === 0) {
      throw new DomainException('Gateway transaction ID cannot be empty');
    }

    this.props.status = PaymentStatus.COMPLETED;
    this.props.gatewayTransactionId = gatewayTransactionId.trim();
    this.props.processedAt = new Date();

    this.addDomainEvent(
      new PaymentProcessedEvent(
        this.id,
        this.props.invoiceId,
        this.props.amount,
        this.props.currency,
        this.props.paymentMethod,
        gatewayTransactionId
      )
    );
  }

  markAsFailed(reason: string, gatewayError?: string): void {
    if (this.props.status === PaymentStatus.COMPLETED) {
      throw new DomainException('Cannot mark completed payment as failed');
    }
    if (!reason || reason.trim().length === 0) {
      throw new DomainException('Failure reason cannot be empty');
    }

    this.props.status = PaymentStatus.FAILED;
    this.props.failureReason = reason.trim();
    this.props.processedAt = new Date();

    this.addDomainEvent(
      new PaymentFailedEvent(
        this.id,
        this.props.invoiceId,
        reason,
        gatewayError
      )
    );
  }

  refund(amount: number, reason: string): void {
    if (this.props.status !== PaymentStatus.COMPLETED) {
      throw new DomainException('Only completed payments can be refunded');
    }
    if (amount <= 0) {
      throw new DomainException('Refund amount must be positive');
    }
    if (amount > this.props.amount) {
      throw new DomainException('Refund amount cannot exceed payment amount');
    }
    if (this.props.refundedAmount && (this.props.refundedAmount + amount) > this.props.amount) {
      throw new DomainException('Total refund amount cannot exceed payment amount');
    }
    if (!reason || reason.trim().length === 0) {
      throw new DomainException('Refund reason cannot be empty');
    }

    const currentRefunded = this.props.refundedAmount || 0;
    this.props.refundedAmount = currentRefunded + amount;
    this.props.refundedAt = new Date();

    if (this.props.refundedAmount === this.props.amount) {
      this.props.status = PaymentStatus.REFUNDED;
    }

    this.addDomainEvent(
      new PaymentRefundedEvent(this.id, amount, reason)
    );
  }

  cancel(): void {
    if (this.props.status === PaymentStatus.COMPLETED) {
      throw new DomainException('Cannot cancel completed payment');
    }
    if (this.props.status === PaymentStatus.CANCELLED) {
      throw new DomainException('Payment is already cancelled');
    }

    this.props.status = PaymentStatus.CANCELLED;
  }

  isFullyRefunded(): boolean {
    return this.props.refundedAmount === this.props.amount;
  }

  isPartiallyRefunded(): boolean {
    return (this.props.refundedAmount || 0) > 0 && (this.props.refundedAmount || 0) < this.props.amount;
  }

  toSnapshot(): PaymentProps & { id: string } {
    return {
      id: this.id,
      ...this.props
    };
  }
}
import { DomainEvent } from '@shared/kernel';

export class InvoiceCreatedEvent extends DomainEvent {
  constructor(
    public readonly invoiceId: string,
    public readonly clientId: string,
    public readonly amount: number,
    public readonly currency: string
  ) {
    super(invoiceId);
  }

  getEventName(): string {
    return 'InvoiceCreated';
  }
}

export class InvoiceSentEvent extends DomainEvent {
  constructor(
    public readonly invoiceId: string,
    public readonly clientEmail: string,
    public readonly sentAt: Date
  ) {
    super(invoiceId);
  }

  getEventName(): string {
    return 'InvoiceSent';
  }
}

export class InvoicePaidEvent extends DomainEvent {
  constructor(
    public readonly invoiceId: string,
    public readonly paidAmount: number,
    public readonly paidAt: Date,
    public readonly paymentMethod: string
  ) {
    super(invoiceId);
  }

  getEventName(): string {
    return 'InvoicePaid';
  }
}

export class InvoiceOverdueEvent extends DomainEvent {
  constructor(
    public readonly invoiceId: string,
    public readonly daysOverdue: number
  ) {
    super(invoiceId);
  }

  getEventName(): string {
    return 'InvoiceOverdue';
  }
}
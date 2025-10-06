import { DomainEvent } from '@shared/kernel';

export class ReceiptUploadedEvent extends DomainEvent {
  constructor(
    public readonly expenseId: string,
    public readonly fileName: string,
    public readonly fileSize: number,
    public readonly mimeType: string
  ) {
    super(expenseId);
  }

  getEventName(): string {
    return 'ReceiptUploaded';
  }
}

export class ExpenseSubmittedEvent extends DomainEvent {
  constructor(
    public readonly expenseId: string,
    public readonly submittedBy: string,
    public readonly amount: number,
    public readonly currency: string
  ) {
    super(expenseId);
  }

  getEventName(): string {
    return 'ExpenseSubmitted';
  }
}

export class ExpenseApprovedEvent extends DomainEvent {
  constructor(
    public readonly expenseId: string,
    public readonly approvedBy: string,
    public readonly approvedAmount: number,
    public readonly notes?: string
  ) {
    super(expenseId);
  }

  getEventName(): string {
    return 'ExpenseApproved';
  }
}

export class ExpenseRejectedEvent extends DomainEvent {
  constructor(
    public readonly expenseId: string,
    public readonly rejectedBy: string,
    public readonly reason: string
  ) {
    super(expenseId);
  }

  getEventName(): string {
    return 'ExpenseRejected';
  }
}
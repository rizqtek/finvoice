import { InvoiceNumber } from '../value-objects/invoice-number';
import { Money } from '../value-objects/money';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { InvoiceStatus, InvoiceType, InvoiceFrequency } from '../enums/invoice.enums';
import { ClientId } from '../../../../shared/kernel/value-objects/client-id';
import { ProjectId } from '../../../../shared/kernel/value-objects/project-id';
import { UserId } from '../../../../shared/kernel/value-objects/user-id';
import { DomainException } from '../../../../shared/kernel/exceptions/domain.exception';

export interface CreateInvoiceParams {
  number: InvoiceNumber;
  clientId: ClientId;
  projectId?: ProjectId;
  issuedBy: UserId;
  type: InvoiceType;
  currency: string;
  dueDate: Date;
  frequency?: InvoiceFrequency;
  notes?: string;
}

export interface UpdateItemParams {
  description?: string;
  quantity?: number;
  unitPrice?: Money;
}

export class InvoiceAggregate {
  public readonly id: string;
  private _items: InvoiceItem[] = [];
  private _status: InvoiceStatus = InvoiceStatus.DRAFT;
  private _finalizedAt?: Date;
  private _sentAt?: Date;
  private _paidAt?: Date;
  private _voidedAt?: Date;
  private _paidAmount?: Money;
  private _voidReason?: string;

  constructor(
    public readonly number: InvoiceNumber,
    public readonly clientId: ClientId,
    public readonly issuedBy: UserId,
    public readonly type: InvoiceType,
    public readonly currency: string,
    public readonly dueDate: Date,
    public readonly projectId?: ProjectId,
    public readonly frequency?: InvoiceFrequency,
    public readonly notes?: string,
    id?: string
  ) {
    this.id = id || this.generateId();
    this.validate();
  }

  private generateId(): string {
    return `invoice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private validate(): void {
    if (this.dueDate <= new Date()) {
      throw DomainException.businessRule('Due date must be in the future');
    }

    if (this.type === InvoiceType.RECURRING && !this.frequency) {
      throw DomainException.businessRule('Recurring invoices must have a frequency');
    }
  }

  static create(params: CreateInvoiceParams): InvoiceAggregate {
    return new InvoiceAggregate(
      params.number,
      params.clientId,
      params.issuedBy,
      params.type,
      params.currency,
      params.dueDate,
      params.projectId,
      params.frequency,
      params.notes
    );
  }

  // Getters
  get items(): readonly InvoiceItem[] {
    return [...this._items];
  }

  get status(): InvoiceStatus {
    return this._status;
  }

  get finalizedAt(): Date | undefined {
    return this._finalizedAt;
  }

  get sentAt(): Date | undefined {
    return this._sentAt;
  }

  get paidAt(): Date | undefined {
    return this._paidAt;
  }

  get voidedAt(): Date | undefined {
    return this._voidedAt;
  }

  get paidAmount(): Money | undefined {
    return this._paidAmount;
  }

  get voidReason(): string | undefined {
    return this._voidReason;
  }

  // Business Methods
  addItem(item: InvoiceItem): void {
    if (this._status !== InvoiceStatus.DRAFT) {
      throw DomainException.businessRule('Cannot add items to non-draft invoice');
    }

    if (item.unitPrice.currency !== this.currency) {
      throw DomainException.businessRule(`Item currency ${item.unitPrice.currency} does not match invoice currency ${this.currency}`);
    }

    this._items.push(item);
  }

  removeItem(itemId: string): void {
    if (this._status !== InvoiceStatus.DRAFT) {
      throw DomainException.businessRule('Cannot remove items from non-draft invoice');
    }

    const index = this._items.findIndex(item => item.id === itemId);
    if (index === -1) {
      throw DomainException.businessRule(`Item with id ${itemId} not found`);
    }

    this._items.splice(index, 1);
  }

  updateItem(itemId: string, updates: UpdateItemParams): void {
    if (this._status !== InvoiceStatus.DRAFT) {
      throw DomainException.businessRule('Cannot update items in non-draft invoice');
    }

    const itemIndex = this._items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) {
      throw DomainException.businessRule(`Item with id ${itemId} not found`);
    }

    const currentItem = this._items[itemIndex];
    let updatedItem = currentItem;

    if (updates.description !== undefined) {
      updatedItem = updatedItem.updateDescription(updates.description);
    }
    if (updates.quantity !== undefined) {
      updatedItem = updatedItem.updateQuantity(updates.quantity);
    }
    if (updates.unitPrice !== undefined) {
      if (updates.unitPrice.currency !== this.currency) {
        throw DomainException.businessRule(`Item currency ${updates.unitPrice.currency} does not match invoice currency ${this.currency}`);
      }
      updatedItem = updatedItem.updateUnitPrice(updates.unitPrice);
    }

    this._items[itemIndex] = updatedItem;
  }

  calculateSubtotal(): Money {
    if (this._items.length === 0) {
      return new Money(0, this.currency);
    }

    const total = this._items.reduce((sum, item) => {
      const itemSubtotal = item.calculateSubtotal();
      return sum === 0 ? itemSubtotal.amount : sum + itemSubtotal.amount;
    }, 0);

    return new Money(total, this.currency);
  }

  calculateTotalTax(): Money {
    if (this._items.length === 0) {
      return new Money(0, this.currency);
    }

    const total = this._items.reduce((sum, item) => {
      const itemTax = item.calculateTaxAmount();
      return sum + itemTax.amount;
    }, 0);

    return new Money(total, this.currency);
  }

  calculateTotal(): Money {
    const subtotal = this.calculateSubtotal();
    const tax = this.calculateTotalTax();
    return Money.add(subtotal, tax);
  }

  finalize(): void {
    if (this._status !== InvoiceStatus.DRAFT) {
      throw DomainException.businessRule('Only draft invoices can be finalized');
    }

    if (this._items.length === 0) {
      throw DomainException.businessRule('Cannot finalize invoice without items');
    }

    this._status = InvoiceStatus.FINALIZED;
    this._finalizedAt = new Date();
  }

  send(): void {
    if (this._status !== InvoiceStatus.FINALIZED) {
      throw DomainException.businessRule('Only finalized invoices can be sent');
    }

    this._status = InvoiceStatus.SENT;
    this._sentAt = new Date();
  }

  recordPayment(amount: Money): void {
    if (![InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID].includes(this._status)) {
      throw DomainException.businessRule('Can only record payments for sent or partially paid invoices');
    }

    if (amount.currency !== this.currency) {
      throw DomainException.businessRule(`Payment currency ${amount.currency} does not match invoice currency ${this.currency}`);
    }

    if (!amount.isPositive()) {
      throw DomainException.businessRule('Payment amount must be positive');
    }

    const currentPaid = this._paidAmount || new Money(0, this.currency);
    const newPaidAmount = Money.add(currentPaid, amount);
    const totalDue = this.calculateTotal();

    this._paidAmount = newPaidAmount;

    if (newPaidAmount.equals(totalDue)) {
      this._status = InvoiceStatus.PAID;
      this._paidAt = new Date();
    } else if (newPaidAmount.isLessThan(totalDue)) {
      this._status = InvoiceStatus.PARTIALLY_PAID;
    } else {
      this._status = InvoiceStatus.OVERPAID;
    }
  }

  markAsPaid(amount: Money): void {
    const totalDue = this.calculateTotal();
    if (!amount.equals(totalDue)) {
      throw DomainException.businessRule(`Payment amount ${amount.toDisplayString()} does not match total due ${totalDue.toDisplayString()}`);
    }

    this.recordPayment(amount);
  }

  void(reason: string): void {
    if (this._status === InvoiceStatus.VOID) {
      throw DomainException.businessRule('Invoice is already voided');
    }

    if (this._status === InvoiceStatus.PAID) {
      throw DomainException.businessRule('Cannot void a paid invoice');
    }

    this._status = InvoiceStatus.VOID;
    this._voidReason = reason;
    this._voidedAt = new Date();
  }

  prorate(startDate: Date, endDate: Date): InvoiceAggregate {
    if (this.type !== InvoiceType.RECURRING) {
      throw DomainException.businessRule('Only recurring invoices can be prorated');
    }

    if (startDate >= endDate) {
      throw DomainException.businessRule('Start date must be before end date');
    }

    // Calculate proration factor (simplified - assumes 30-day months)
    const totalDays = 30;
    const actualDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const prorationFactor = actualDays / totalDays;

    // Create new prorated invoice
    const proratedInvoice = InvoiceAggregate.create({
      number: InvoiceNumber.generate('PRO'),
      clientId: this.clientId,
      projectId: this.projectId,
      issuedBy: this.issuedBy,
      type: InvoiceType.STANDARD,
      currency: this.currency,
      dueDate: this.dueDate,
      notes: `Prorated invoice for period ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
    });

    // Add prorated items
    this._items.forEach(item => {
      const proratedUnitPrice = Money.multiply(item.unitPrice, prorationFactor);
      const proratedItem = InvoiceItem.create({
        description: `${item.description} (Prorated)`,
        quantity: item.quantity,
        unitPrice: proratedUnitPrice,
        taxRate: item.taxRate
      });
      proratedInvoice.addItem(proratedItem);
    });

    return proratedInvoice;
  }
}
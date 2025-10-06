import { AggregateRoot, DomainException } from '@shared/kernel';
import { Money } from '../value-objects/money';
import { TaxRate } from '../value-objects/tax-rate';
import { InvoiceStatus } from '../value-objects/enums';
import { InvoiceCreatedEvent, InvoiceSentEvent, InvoicePaidEvent, InvoiceOverdueEvent } from '../events/invoice-events';

interface LineItemProps {
  description: string;
  quantity: number;
  unitPrice: Money;
  taxRate?: TaxRate;
}

export class LineItem {
  constructor(
    public readonly description: string,
    public readonly quantity: number,
    public readonly unitPrice: Money,
    public readonly taxRate?: TaxRate
  ) {
    if (!description || description.trim().length === 0) {
      throw new DomainException('Line item description cannot be empty');
    }
    if (quantity <= 0) {
      throw new DomainException('Line item quantity must be positive');
    }
  }

  getSubtotal(): Money {
    return this.unitPrice.multiply(this.quantity);
  }

  getTaxAmount(): Money {
    if (!this.taxRate) {
      return new Money(0, this.unitPrice.currency);
    }
    return this.getSubtotal().multiply(this.taxRate.rate);
  }

  getTotal(): Money {
    return this.getSubtotal().add(this.getTaxAmount());
  }
}

interface TaxLineProps {
  taxRate: TaxRate;
  amount: Money;
}

export class TaxLine {
  constructor(
    public readonly taxRate: TaxRate,
    public readonly amount: Money
  ) {}
}

interface InvoiceProps {
  clientId: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  lineItems: LineItem[];
  notes?: string;
  status: InvoiceStatus;
  sentAt?: Date;
  paidAt?: Date;
  paidAmount?: Money;
}

export class InvoiceAggregate extends AggregateRoot {
  private constructor(
    private props: InvoiceProps,
    id?: string
  ) {
    super(id);
  }

  static create(
    clientId: string,
    invoiceNumber: string,
    issueDate: Date,
    dueDate: Date,
    lineItems: LineItem[],
    notes?: string
  ): InvoiceAggregate {
    if (!clientId || clientId.trim().length === 0) {
      throw new DomainException('Client ID cannot be empty');
    }
    if (!invoiceNumber || invoiceNumber.trim().length === 0) {
      throw new DomainException('Invoice number cannot be empty');
    }
    if (lineItems.length === 0) {
      throw new DomainException('Invoice must have at least one line item');
    }
    if (dueDate < issueDate) {
      throw new DomainException('Due date cannot be before issue date');
    }

    const invoice = new InvoiceAggregate({
      clientId: clientId.trim(),
      invoiceNumber: invoiceNumber.trim(),
      issueDate,
      dueDate,
      lineItems: [...lineItems],
      notes: notes?.trim(),
      status: InvoiceStatus.DRAFT
    });

    const total = invoice.calculateTotal();
    invoice.addDomainEvent(
      new InvoiceCreatedEvent(
        invoice.id,
        clientId,
        total.amount,
        total.currency
      )
    );

    return invoice;
  }

  static fromPersistence(props: InvoiceProps, id: string): InvoiceAggregate {
    return new InvoiceAggregate(props, id);
  }

  // Getters
  get clientId(): string {
    return this.props.clientId;
  }

  get invoiceNumber(): string {
    return this.props.invoiceNumber;
  }

  get issueDate(): Date {
    return this.props.issueDate;
  }

  get dueDate(): Date {
    return this.props.dueDate;
  }

  get lineItems(): LineItem[] {
    return [...this.props.lineItems];
  }

  get notes(): string | undefined {
    return this.props.notes;
  }

  get status(): InvoiceStatus {
    return this.props.status;
  }

  get sentAt(): Date | undefined {
    return this.props.sentAt;
  }

  get paidAt(): Date | undefined {
    return this.props.paidAt;
  }

  get paidAmount(): Money | undefined {
    return this.props.paidAmount;
  }

  // Business methods
  calculateSubtotal(): Money {
    if (this.props.lineItems.length === 0) {
      return new Money(0);
    }

    return this.props.lineItems
      .map(item => item.getSubtotal())
      .reduce((total, subtotal) => total.add(subtotal));
  }

  calculateTaxLines(): TaxLine[] {
    const taxMap = new Map<string, Money>();

    this.props.lineItems.forEach(item => {
      if (item.taxRate) {
        const existing = taxMap.get(item.taxRate.name);
        const taxAmount = item.getTaxAmount();
        
        if (existing) {
          taxMap.set(item.taxRate.name, existing.add(taxAmount));
        } else {
          taxMap.set(item.taxRate.name, taxAmount);
        }
      }
    });

    return Array.from(taxMap.entries()).map(([name, amount]) => {
      const taxRate = this.props.lineItems
        .find(item => item.taxRate?.name === name)?.taxRate!;
      return new TaxLine(taxRate, amount);
    });
  }

  calculateTotalTax(): Money {
    const taxLines = this.calculateTaxLines();
    if (taxLines.length === 0) {
      return new Money(0);
    }

    return taxLines
      .map(line => line.amount)
      .reduce((total, tax) => total.add(tax));
  }

  calculateTotal(): Money {
    return this.calculateSubtotal().add(this.calculateTotalTax());
  }

  markSent(clientEmail: string): void {
    if (this.props.status !== InvoiceStatus.DRAFT) {
      throw new DomainException('Only draft invoices can be sent');
    }

    this.props.status = InvoiceStatus.SENT;
    this.props.sentAt = new Date();

    this.addDomainEvent(
      new InvoiceSentEvent(this.id, clientEmail, this.props.sentAt)
    );
  }

  markPaid(amount: Money, paymentMethod: string): void {
    if (this.props.status === InvoiceStatus.PAID) {
      throw new DomainException('Invoice is already paid');
    }
    if (this.props.status === InvoiceStatus.CANCELLED) {
      throw new DomainException('Cannot mark cancelled invoice as paid');
    }

    const total = this.calculateTotal();
    if (amount.currency !== total.currency) {
      throw new DomainException('Payment currency must match invoice currency');
    }
    if (amount.amount < total.amount) {
      throw new DomainException('Payment amount is less than invoice total');
    }

    this.props.status = InvoiceStatus.PAID;
    this.props.paidAt = new Date();
    this.props.paidAmount = amount;

    this.addDomainEvent(
      new InvoicePaidEvent(this.id, amount.amount, this.props.paidAt, paymentMethod)
    );
  }

  markOverdue(): void {
    if (this.props.status !== InvoiceStatus.SENT && this.props.status !== InvoiceStatus.VIEWED) {
      throw new DomainException('Only sent or viewed invoices can be marked overdue');
    }

    const today = new Date();
    if (this.props.dueDate >= today) {
      throw new DomainException('Invoice is not yet due');
    }

    this.props.status = InvoiceStatus.OVERDUE;
    
    const daysOverdue = Math.floor((today.getTime() - this.props.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    this.addDomainEvent(
      new InvoiceOverdueEvent(this.id, daysOverdue)
    );
  }

  cancel(): void {
    if (this.props.status === InvoiceStatus.PAID) {
      throw new DomainException('Cannot cancel a paid invoice');
    }

    this.props.status = InvoiceStatus.CANCELLED;
  }

  isOverdue(): boolean {
    return this.props.status === InvoiceStatus.OVERDUE || 
           (this.props.status === InvoiceStatus.SENT && new Date() > this.props.dueDate);
  }

  addLineItem(lineItem: LineItem): void {
    if (this.props.status !== InvoiceStatus.DRAFT) {
      throw new DomainException('Can only add line items to draft invoices');
    }
    this.props.lineItems.push(lineItem);
  }

  removeLineItem(index: number): void {
    if (this.props.status !== InvoiceStatus.DRAFT) {
      throw new DomainException('Can only remove line items from draft invoices');
    }
    if (index < 0 || index >= this.props.lineItems.length) {
      throw new DomainException('Invalid line item index');
    }
    if (this.props.lineItems.length === 1) {
      throw new DomainException('Invoice must have at least one line item');
    }
    this.props.lineItems.splice(index, 1);
  }

  toSnapshot(): InvoiceProps & { id: string } {
    return {
      id: this.id,
      ...this.props,
      lineItems: [...this.props.lineItems]
    };
  }
}
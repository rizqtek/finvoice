import { Money } from '../value-objects/money';
import { TaxRate } from '../value-objects/tax-rate';
import { DomainException } from '../../../../shared/kernel/exceptions/domain.exception';

export class InvoiceItem {
  public readonly id: string;

  constructor(
    public readonly description: string,
    public readonly quantity: number,
    public readonly unitPrice: Money,
    public readonly taxRate: TaxRate,
    id?: string
  ) {
    this.id = id || this.generateId();
    this.validate();
  }

  private validate(): void {
    if (!this.description || this.description.trim().length === 0) {
      throw DomainException.required('description');
    }

    if (typeof this.quantity !== 'number' || this.quantity <= 0) {
      throw DomainException.invalidValue('quantity', this.quantity);
    }

    if (!this.unitPrice.isPositive()) {
      throw DomainException.invalidValue('unitPrice', 'Unit price must be positive');
    }
  }

  private generateId(): string {
    return `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static create(params: {
    description: string;
    quantity: number;
    unitPrice: Money;
    taxRate: TaxRate;
    id?: string;
  }): InvoiceItem {
    return new InvoiceItem(
      params.description,
      params.quantity,
      params.unitPrice,
      params.taxRate,
      params.id
    );
  }

  calculateSubtotal(): Money {
    return Money.multiply(this.unitPrice, this.quantity);
  }

  calculateTaxAmount(): Money {
    const subtotal = this.calculateSubtotal();
    const taxAmount = this.taxRate.calculateTax(subtotal.amount);
    return new Money(taxAmount, subtotal.currency);
  }

  calculateTotal(): Money {
    const subtotal = this.calculateSubtotal();
    const tax = this.calculateTaxAmount();
    return Money.add(subtotal, tax);
  }

  updateDescription(newDescription: string): InvoiceItem {
    return new InvoiceItem(newDescription, this.quantity, this.unitPrice, this.taxRate, this.id);
  }

  updateQuantity(newQuantity: number): InvoiceItem {
    return new InvoiceItem(this.description, newQuantity, this.unitPrice, this.taxRate, this.id);
  }

  updateUnitPrice(newUnitPrice: Money): InvoiceItem {
    return new InvoiceItem(this.description, this.quantity, newUnitPrice, this.taxRate, this.id);
  }

  updateTaxRate(newTaxRate: TaxRate): InvoiceItem {
    return new InvoiceItem(this.description, this.quantity, this.unitPrice, newTaxRate, this.id);
  }

  equals(other: InvoiceItem): boolean {
    return this.id === other.id;
  }
}
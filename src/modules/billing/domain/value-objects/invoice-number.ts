import { DomainException } from '../../../../shared/kernel/exceptions/domain.exception';

export class InvoiceNumber {
  private static counter = 1000;

  constructor(private readonly value: string) {
    this.validate(value);
  }

  private validate(value: string): void {
    if (!value || value.trim().length === 0) {
      throw DomainException.required('InvoiceNumber');
    }

    // Basic format validation: should start with letters followed by numbers
    const pattern = /^[A-Z]{2,4}-\d{3,6}$/;
    if (!pattern.test(value)) {
      throw DomainException.invalidValue('InvoiceNumber', `Invalid format: ${value}. Expected format: XXX-123456`);
    }
  }

  static create(value: string): InvoiceNumber {
    return new InvoiceNumber(value);
  }

  static generate(prefix: string = 'INV'): InvoiceNumber {
    const number = `${prefix}-${InvoiceNumber.counter.toString().padStart(6, '0')}`;
    InvoiceNumber.counter++;
    return new InvoiceNumber(number);
  }

  static fromString(value: string): InvoiceNumber {
    return new InvoiceNumber(value);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: InvoiceNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
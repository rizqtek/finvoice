import { DomainException } from '../../../../shared/kernel/exceptions/domain.exception';

export class TaxRate {
  constructor(
    public readonly rate: number,
    public readonly type: string
  ) {
    this.validateRate(rate);
    this.validateType(type);
  }

  private validateRate(rate: number): void {
    if (typeof rate !== 'number' || isNaN(rate) || !isFinite(rate)) {
      throw DomainException.invalidValue('rate', rate);
    }

    if (rate < 0 || rate > 100) {
      throw DomainException.invalidValue('rate', `Tax rate must be between 0 and 100, got: ${rate}`);
    }
  }

  private validateType(type: string): void {
    if (!type || type.trim().length === 0) {
      throw DomainException.required('type');
    }

    const validTypes = ['SALES_TAX', 'VAT', 'GST', 'STATE_TAX', 'CITY_TAX', 'NO_TAX', 'COMBINED_TAX'];
    if (!validTypes.includes(type)) {
      throw DomainException.invalidValue('type', type);
    }
  }

  static create(rate: number, type: string): TaxRate {
    return new TaxRate(rate, type);
  }

  static noTax(): TaxRate {
    return new TaxRate(0, 'NO_TAX');
  }

  calculateTax(amount: number): number {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
      throw DomainException.invalidValue('amount', amount);
    }
    
    return Math.round(amount * (this.rate / 100) * 100) / 100;
  }

  getDecimalRate(): number {
    return this.rate / 100;
  }

  isZero(): boolean {
    return this.rate === 0;
  }

  equals(other: TaxRate): boolean {
    return this.rate === other.rate && this.type === other.type;
  }

  isGreaterThan(other: TaxRate): boolean {
    return this.rate > other.rate;
  }

  isLessThan(other: TaxRate): boolean {
    return this.rate < other.rate;
  }

  toDisplayString(): string {
    if (this.isZero()) {
      return 'No Tax (0%)';
    }
    return `${this.type.replace('_', ' ')} (${this.rate.toFixed(2)}%)`;
  }
}
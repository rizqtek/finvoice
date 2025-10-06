import { DomainException } from '../../../../shared/kernel/exceptions/domain.exception';

export class Money {
  private static readonly VALID_CURRENCIES = [
    'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR'
  ];

  constructor(
    public readonly amount: number,
    public readonly currency: string
  ) {
    this.validateAmount(amount);
    this.validateCurrency(currency);
  }

  private validateAmount(amount: number): void {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
      throw DomainException.invalidValue('amount', amount);
    }

    // Check for too many decimal places (max 2 for most currencies)
    const decimalPlaces = (amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      throw DomainException.invalidValue('amount', `Amount has too many decimal places: ${amount}`);
    }
  }

  private validateCurrency(currency: string): void {
    if (!currency || currency.trim().length === 0) {
      throw DomainException.required('currency');
    }

    if (!Money.VALID_CURRENCIES.includes(currency)) {
      throw DomainException.invalidValue('currency', currency);
    }
  }

  static add(money1: Money, money2: Money): Money {
    if (money1.currency !== money2.currency) {
      throw DomainException.businessRule(`Cannot add different currencies: ${money1.currency} and ${money2.currency}`);
    }
    return new Money(money1.amount + money2.amount, money1.currency);
  }

  static subtract(money1: Money, money2: Money): Money {
    if (money1.currency !== money2.currency) {
      throw DomainException.businessRule(`Cannot subtract different currencies: ${money1.currency} and ${money2.currency}`);
    }
    return new Money(money1.amount - money2.amount, money1.currency);
  }

  static multiply(money: Money, factor: number): Money {
    if (typeof factor !== 'number' || isNaN(factor) || !isFinite(factor)) {
      throw DomainException.invalidValue('factor', factor);
    }
    return new Money(Math.round(money.amount * factor * 100) / 100, money.currency);
  }

  static divide(money: Money, divisor: number): Money {
    if (typeof divisor !== 'number' || isNaN(divisor) || !isFinite(divisor) || divisor === 0) {
      throw DomainException.invalidValue('divisor', divisor);
    }
    return new Money(Math.round(money.amount / divisor * 100) / 100, money.currency);
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  isPositive(): boolean {
    return this.amount > 0;
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  isGreaterThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw DomainException.businessRule(`Cannot compare different currencies: ${this.currency} and ${other.currency}`);
    }
    return this.amount > other.amount;
  }

  isLessThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw DomainException.businessRule(`Cannot compare different currencies: ${this.currency} and ${other.currency}`);
    }
    return this.amount < other.amount;
  }

  toDisplayString(): string {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    return formatter.format(this.amount);
  }
}
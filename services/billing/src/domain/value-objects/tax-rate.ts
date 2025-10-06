import { ValueObject } from '@shared/kernel';

interface TaxRateProps {
  rate: number;
  name: string;
}

export class TaxRate extends ValueObject<TaxRateProps> {
  constructor(rate: number, name: string) {
    if (rate < 0 || rate > 1) {
      throw new Error('Tax rate must be between 0 and 1');
    }
    if (!name || name.trim().length === 0) {
      throw new Error('Tax rate name cannot be empty');
    }
    super({ rate, name: name.trim() });
  }

  get rate(): number {
    return this._value.rate;
  }

  get name(): string {
    return this._value.name;
  }

  get percentage(): number {
    return this.rate * 100;
  }

  toString(): string {
    return `${this.name} (${this.percentage}%)`;
  }
}
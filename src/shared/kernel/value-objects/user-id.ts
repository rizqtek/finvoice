import { DomainException } from '../exceptions/domain.exception';

export class UserId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw DomainException.required('UserId');
    }
  }

  static create(value: string): UserId {
    return new UserId(value);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
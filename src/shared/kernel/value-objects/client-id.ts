import { DomainException } from '../exceptions/domain.exception';

export class ClientId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw DomainException.required('ClientId');
    }
  }

  static create(value: string): ClientId {
    return new ClientId(value);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: ClientId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
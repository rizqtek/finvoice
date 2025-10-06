export class DomainException extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'DomainException';
  }

  static invalidValue(field: string, value: any): DomainException {
    return new DomainException(`Invalid value for ${field}: ${value}`, 'INVALID_VALUE');
  }

  static required(field: string): DomainException {
    return new DomainException(`${field} is required`, 'REQUIRED_FIELD');
  }

  static businessRule(message: string): DomainException {
    return new DomainException(message, 'BUSINESS_RULE_VIOLATION');
  }
}
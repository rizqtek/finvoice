import { AggregateRoot, DomainException } from '@shared/kernel';

interface AddressProps {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export class Address {
  constructor(
    public readonly street: string,
    public readonly city: string,
    public readonly state: string,
    public readonly postalCode: string,
    public readonly country: string
  ) {
    if (!street || street.trim().length === 0) {
      throw new DomainException('Street address cannot be empty');
    }
    if (!city || city.trim().length === 0) {
      throw new DomainException('City cannot be empty');
    }
    if (!country || country.trim().length === 0) {
      throw new DomainException('Country cannot be empty');
    }
  }

  toString(): string {
    return `${this.street}, ${this.city}, ${this.state} ${this.postalCode}, ${this.country}`;
  }
}

interface ClientProps {
  name: string;
  email: string;
  phone?: string;
  taxId?: string;
  address?: Address;
  billingAddress?: Address;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ClientAggregate extends AggregateRoot {
  private constructor(
    private props: ClientProps,
    id?: string
  ) {
    super(id);
  }

  static create(
    name: string,
    email: string,
    phone?: string,
    taxId?: string,
    address?: Address,
    billingAddress?: Address
  ): ClientAggregate {
    if (!name || name.trim().length === 0) {
      throw new DomainException('Client name cannot be empty');
    }
    if (!email || !this.isValidEmail(email)) {
      throw new DomainException('Valid email is required');
    }

    const now = new Date();
    return new ClientAggregate({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim(),
      taxId: taxId?.trim(),
      address,
      billingAddress,
      isActive: true,
      createdAt: now,
      updatedAt: now
    });
  }

  static fromPersistence(props: ClientProps, id: string): ClientAggregate {
    return new ClientAggregate(props, id);
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Getters
  get name(): string {
    return this.props.name;
  }

  get email(): string {
    return this.props.email;
  }

  get phone(): string | undefined {
    return this.props.phone;
  }

  get taxId(): string | undefined {
    return this.props.taxId;
  }

  get address(): Address | undefined {
    return this.props.address;
  }

  get billingAddress(): Address | undefined {
    return this.props.billingAddress;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // Business methods
  updateContactInfo(name?: string, email?: string, phone?: string): void {
    if (name && name.trim().length > 0) {
      this.props.name = name.trim();
    }
    if (email && ClientAggregate.isValidEmail(email)) {
      this.props.email = email.toLowerCase().trim();
    }
    if (phone !== undefined) {
      this.props.phone = phone?.trim();
    }
    this.props.updatedAt = new Date();
  }

  updateAddress(address: Address): void {
    this.props.address = address;
    this.props.updatedAt = new Date();
  }

  updateBillingAddress(billingAddress: Address): void {
    this.props.billingAddress = billingAddress;
    this.props.updatedAt = new Date();
  }

  updateTaxId(taxId: string): void {
    this.props.taxId = taxId?.trim();
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.isActive = true;
    this.props.updatedAt = new Date();
  }

  toSnapshot(): ClientProps & { id: string } {
    return {
      id: this.id,
      ...this.props
    };
  }
}
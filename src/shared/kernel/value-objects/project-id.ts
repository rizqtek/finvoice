import { DomainException } from '../exceptions/domain.exception';

export class ProjectId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw DomainException.required('ProjectId');
    }
  }

  static create(value: string): ProjectId {
    return new ProjectId(value);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: ProjectId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
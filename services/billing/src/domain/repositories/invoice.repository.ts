import { InvoiceAggregate } from '../aggregates/invoice.aggregate';
import { InvoiceStatus } from '../value-objects/enums';

export interface InvoiceFilters {
  clientId?: string;
  status?: InvoiceStatus;
  issueDateFrom?: Date;
  issueDateTo?: Date;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  search?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface InvoiceRepository {
  save(invoice: InvoiceAggregate): Promise<void>;
  findById(id: string): Promise<InvoiceAggregate | null>;
  findByInvoiceNumber(invoiceNumber: string): Promise<InvoiceAggregate | null>;
  findAll(
    filters?: InvoiceFilters,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<InvoiceAggregate>>;
  findOverdueInvoices(): Promise<InvoiceAggregate[]>;
  findRecurringInvoicesDue(): Promise<InvoiceAggregate[]>;
  delete(id: string): Promise<void>;
  exists(invoiceNumber: string): Promise<boolean>;
}
import { InvoiceAggregate } from '../aggregates/invoice.aggregate';
import { InvoiceStatus } from '../enums/invoice.enums';

export interface InvoiceRepository {
  save(invoice: InvoiceAggregate): Promise<void>;
  findById(id: string): Promise<InvoiceAggregate | null>;
  findByNumber(number: string): Promise<InvoiceAggregate | null>;
  findByClientId(clientId: string): Promise<InvoiceAggregate[]>;
  findByStatus(status: InvoiceStatus): Promise<InvoiceAggregate[]>;
  findOverdue(): Promise<InvoiceAggregate[]>;
  findDraftsByUser(userId: string): Promise<InvoiceAggregate[]>;
  existsByNumber(number: string): Promise<boolean>;
  delete(id: string): Promise<void>;
}
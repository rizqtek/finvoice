import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { InvoiceRepository } from '../../domain/repositories/invoice.repository';
import { InvoiceStatus } from '../../domain/enums/invoice.enums';
import { BILLING_TOKENS } from '../../constants';

export interface ListInvoicesQuery {
  page?: number;
  limit?: number;
  status?: InvoiceStatus;
  clientId?: string;
  issuedBy?: string;
}

@Injectable()
export class ListInvoicesUseCase {
  private readonly logger = new Logger(ListInvoicesUseCase.name);

  constructor(@Inject(BILLING_TOKENS.INVOICE_REPOSITORY) private readonly invoiceRepository: InvoiceRepository) {}

  async execute(query: ListInvoicesQuery = {}): Promise<{
    invoices: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    try {
      const { page = 1, limit = 10, status, clientId, issuedBy } = query;

      let invoices = [];

      if (status) {
        invoices = await this.invoiceRepository.findByStatus(status);
      } else if (clientId) {
        invoices = await this.invoiceRepository.findByClientId(clientId);
      } else if (issuedBy) {
        invoices = await this.invoiceRepository.findDraftsByUser(issuedBy);
      } else {
        // For now, get all invoices (in production, this should be paginated properly)
        const allStatuses = Object.values(InvoiceStatus);
        const allInvoices = await Promise.all(
          allStatuses.map(s => this.invoiceRepository.findByStatus(s))
        );
        invoices = allInvoices.flat();
      }

      // Simple pagination (in production, use database-level pagination)
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedInvoices = invoices.slice(startIndex, endIndex);

      const mappedInvoices = paginatedInvoices.map(invoice => ({
        id: invoice.id,
        number: invoice.number.getValue(),
        clientId: invoice.clientId.getValue(),
        projectId: invoice.projectId?.getValue(),
        issuedBy: invoice.issuedBy.getValue(),
        type: invoice.type,
        status: invoice.status,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        frequency: invoice.frequency,
        notes: invoice.notes,
        totals: {
          subtotal: {
            amount: invoice.calculateSubtotal().amount,
            currency: invoice.calculateSubtotal().currency,
          },
          totalTax: {
            amount: invoice.calculateTotalTax().amount,
            currency: invoice.calculateTotalTax().currency,
          },
          total: {
            amount: invoice.calculateTotal().amount,
            currency: invoice.calculateTotal().currency,
          },
        },
        finalizedAt: invoice.finalizedAt,
        sentAt: invoice.sentAt,
        paidAt: invoice.paidAt,
        voidedAt: invoice.voidedAt,
      }));

      this.logger.log(`Listed ${mappedInvoices.length} invoices`);

      return {
        invoices: mappedInvoices,
        pagination: {
          page,
          limit,
          total: invoices.length,
          pages: Math.ceil(invoices.length / limit),
        },
      };
    } catch (error) {
      this.logger.error('Failed to list invoices', error);
      throw error;
    }
  }
}
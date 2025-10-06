import { Injectable } from '@nestjs/common';
import { MongoInvoiceRepository } from '../../infrastructure/repositories/mongo-invoice.repository';
import { ListInvoicesQueryDto, InvoiceResponseDto } from '../dto/invoice.dto';

@Injectable()
export class ListInvoicesUseCase {
  constructor(
    private readonly invoiceRepository: MongoInvoiceRepository,
  ) {}

  async execute(query: ListInvoicesQueryDto): Promise<{
    invoices: InvoiceResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 10, customerId, status } = query;

    // Build filter criteria
    const filter: any = {};
    if (customerId) {
      filter.customerId = customerId;
    }
    if (status) {
      if (status === 'overdue') {
        filter.status = { $in: ['sent', 'viewed'] };
        filter.dueDate = { $lt: new Date() };
      } else {
        filter.status = status;
      }
    }

    // For now, we'll simulate pagination since we don't have full MongoDB query support
    let invoices: any[] = [];
    
    if (customerId) {
      invoices = await this.invoiceRepository.findByCustomerId(customerId);
    } else if (status === 'overdue') {
      invoices = await this.invoiceRepository.findOverdueInvoices();
    } else {
      // For demo purposes, we'll return empty array for now
      // In a real implementation, you'd add pagination support to the repository
      invoices = [];
    }

    // Apply status filter if needed (and not overdue)
    if (status && status !== 'overdue') {
      invoices = invoices.filter(invoice => invoice.status === status);
    }

    // Simple pagination simulation
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedInvoices = invoices.slice(startIndex, endIndex);

    return {
      invoices: paginatedInvoices.map(invoice => this.mapToResponseDto(invoice)),
      total: invoices.length,
      page,
      limit,
    };
  }

  private mapToResponseDto(invoice: any): InvoiceResponseDto {
    return {
      id: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId.toString(),
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      lineItems: invoice.lineItems,
      subtotal: invoice.subtotal.amount,
      totalAmount: invoice.totalAmount.amount,
      currency: invoice.totalAmount.currency,
      notes: invoice.notes,
      terms: invoice.terms,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
  }
}
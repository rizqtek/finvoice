import { Injectable, NotFoundException } from '@nestjs/common';
import { MongoInvoiceRepository } from '../../infrastructure/repositories/mongo-invoice.repository';
import { InvoiceResponseDto } from '../dto/invoice.dto';

@Injectable()
export class GetInvoiceUseCase {
  constructor(
    private readonly invoiceRepository: MongoInvoiceRepository,
  ) {}

  async execute(id: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findById(id);
    
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    return this.mapToResponseDto(invoice);
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
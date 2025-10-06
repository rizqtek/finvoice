import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { MongoInvoiceRepository } from '../../infrastructure/repositories/mongo-invoice.repository';
import { BullMQService } from '@shared/infrastructure/jobs/bullmq.service';
import { InvoiceResponseDto } from '../dto/invoice.dto';

@Injectable()
export class SendInvoiceUseCase {
  constructor(
    private readonly invoiceRepository: MongoInvoiceRepository,
    private readonly jobService: BullMQService,
  ) {}

  async execute(id: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findById(id);
    
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    // Check if invoice can be sent (only draft invoices can be sent)
    if (invoice.status !== 'draft') {
      throw new BadRequestException(`Cannot send invoice with status: ${invoice.status}. Only draft invoices can be sent.`);
    }

    // Update invoice status to sent
    const updateData = {
      _id: invoice._id,
      status: 'sent',
      sentAt: new Date(),
      updatedAt: new Date(),
    };

    await this.invoiceRepository.save(updateData);

    // Queue email sending job
    await this.jobService.addJob('invoice-processing', 'send-invoice', {
      invoiceId: id,
      action: 'send',
    });

    // Queue PDF generation job
    await this.jobService.addJob('invoice-processing', 'generate-pdf', {
      invoiceId: id,
      action: 'generate-pdf',
    });

    // Fetch and return updated invoice
    const updatedInvoice = await this.invoiceRepository.findById(id);
    return this.mapToResponseDto(updatedInvoice);
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
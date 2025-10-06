import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { MongoInvoiceRepository } from '../../infrastructure/repositories/mongo-invoice.repository';

@Injectable()
export class DeleteInvoiceUseCase {
  constructor(
    private readonly invoiceRepository: MongoInvoiceRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const invoice = await this.invoiceRepository.findById(id);
    
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    // Check if invoice can be deleted (only draft invoices can be deleted)
    if (invoice.status !== 'draft') {
      throw new BadRequestException(`Cannot delete invoice with status: ${invoice.status}. Only draft invoices can be deleted.`);
    }

    await this.invoiceRepository.delete(id);
  }
}
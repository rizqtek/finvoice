import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { MongoInvoiceRepository } from '../../infrastructure/repositories/mongo-invoice.repository';
import { UpdateInvoiceDto, InvoiceResponseDto } from '../dto/invoice.dto';

@Injectable()
export class UpdateInvoiceUseCase {
  constructor(
    private readonly invoiceRepository: MongoInvoiceRepository,
  ) {}

  async execute(id: string, updateDto: UpdateInvoiceDto): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findById(id);
    
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    // Check if invoice can be updated (only draft and sent invoices can be updated)
    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      throw new BadRequestException(`Cannot update invoice with status: ${invoice.status}`);
    }

    // Prepare update data
    const updateData: any = {
      ...updateDto,
      updatedAt: new Date(),
    };

    // Convert date strings to Date objects
    if (updateDto.dueDate) {
      updateData.dueDate = new Date(updateDto.dueDate);
    }

    // Calculate totals if line items are updated
    if (updateDto.lineItems) {
      const lineItems = updateDto.lineItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: {
          amount: item.unitPrice,
          currency: item.currency || 'USD',
        },
        total: {
          amount: item.quantity * item.unitPrice,
          currency: item.currency || 'USD',
        },
      }));

      const subtotalAmount = lineItems.reduce((sum, item) => sum + item.total.amount, 0);
      
      updateData.lineItems = lineItems;
      updateData.subtotal = {
        amount: subtotalAmount,
        currency: lineItems[0]?.total.currency || 'USD',
      };
      updateData.totalAmount = {
        amount: subtotalAmount, // Add tax calculation here if needed
        currency: lineItems[0]?.total.currency || 'USD',
      };
    }

    // Update the invoice
    await this.invoiceRepository.save({ _id: invoice._id, ...updateData });

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
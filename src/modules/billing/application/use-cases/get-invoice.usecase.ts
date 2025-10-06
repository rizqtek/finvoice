import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { InvoiceRepository } from '../../domain/repositories/invoice.repository';
import { InvoiceAggregate } from '../../domain/aggregates/invoice.aggregate';
import { BILLING_TOKENS } from '../../constants';

@Injectable()
export class GetInvoiceUseCase {
  private readonly logger = new Logger(GetInvoiceUseCase.name);

  constructor(@Inject(BILLING_TOKENS.INVOICE_REPOSITORY) private readonly invoiceRepository: InvoiceRepository) {}

  async execute(id: string): Promise<{
    id: string;
    number: string;
    clientId: string;
    projectId?: string;
    issuedBy: string;
    type: string;
    status: string;
    currency: string;
    dueDate: Date;
    frequency?: string;
    notes?: string;
    items: Array<{
      id: string;
      description: string;
      quantity: number;
      unitPrice: { amount: number; currency: string };
      taxRate?: { rate: number; type: string };
      total: { amount: number; currency: string };
    }>;
    totals: {
      subtotal: { amount: number; currency: string };
      totalTax: { amount: number; currency: string };
      total: { amount: number; currency: string };
    };
    finalizedAt?: Date;
    sentAt?: Date;
    paidAt?: Date;
    voidedAt?: Date;
    paidAmount?: { amount: number; currency: string };
    voidReason?: string;
  }> {
    try {
      const invoice = await this.invoiceRepository.findById(id);
      
      if (!invoice) {
        throw new NotFoundException(`Invoice with ID ${id} not found`);
      }

      return this.mapToResponse(invoice);
    } catch (error) {
      this.logger.error(`Failed to get invoice: ${id}`, error);
      throw error;
    }
  }

  async getByNumber(number: string): Promise<any> {
    try {
      const invoice = await this.invoiceRepository.findByNumber(number);
      
      if (!invoice) {
        throw new NotFoundException(`Invoice with number ${number} not found`);
      }

      return this.mapToResponse(invoice);
    } catch (error) {
      this.logger.error(`Failed to get invoice by number: ${number}`, error);
      throw error;
    }
  }

  private mapToResponse(invoice: InvoiceAggregate) {
    return {
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
      items: invoice.items.map(item => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: {
          amount: item.unitPrice.amount,
          currency: item.unitPrice.currency,
        },
        taxRate: item.taxRate ? {
          rate: item.taxRate.rate,
          type: item.taxRate.type,
        } : undefined,
        total: {
          amount: item.calculateTotal().amount,
          currency: item.calculateTotal().currency,
        },
      })),
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
      paidAmount: invoice.paidAmount ? {
        amount: invoice.paidAmount.amount,
        currency: invoice.paidAmount.currency,
      } : undefined,
      voidReason: invoice.voidReason,
    };
  }
}
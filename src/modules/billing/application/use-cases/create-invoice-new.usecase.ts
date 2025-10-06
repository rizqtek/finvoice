import { Injectable, ConflictException, NotFoundException, Logger, Inject } from '@nestjs/common';
import { InvoiceRepository } from '../../domain/repositories/invoice.repository';
import { BILLING_TOKENS } from '../../constants';
import { InvoiceAggregate } from '../../domain/aggregates/invoice.aggregate';
import { InvoiceItem } from '../../domain/entities/invoice-item.entity';
import { InvoiceNumber } from '../../domain/value-objects/invoice-number';
import { Money } from '../../domain/value-objects/money';
import { TaxRate } from '../../domain/value-objects/tax-rate';
import { ClientId } from '../../../../shared/kernel/value-objects/client-id';
import { ProjectId } from '../../../../shared/kernel/value-objects/project-id';
import { UserId } from '../../../../shared/kernel/value-objects/user-id';
import { InvoiceType, InvoiceFrequency } from '../../domain/enums/invoice.enums';

export interface CreateInvoiceCommand {
  clientId: string;
  projectId?: string;
  issuedBy: string;
  type: InvoiceType;
  currency: string;
  dueDate: Date;
  frequency?: InvoiceFrequency;
  notes?: string;
  items?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate?: number;
  }>;
}

@Injectable()
export class CreateInvoiceUseCase {
  private readonly logger = new Logger(CreateInvoiceUseCase.name);

  constructor(@Inject(BILLING_TOKENS.INVOICE_REPOSITORY) private readonly invoiceRepository: InvoiceRepository) {}

  async execute(command: CreateInvoiceCommand): Promise<{ id: string; number: string }> {
    try {
      // Generate unique invoice number
      const invoiceNumber = InvoiceNumber.generate('INV');
      
      // Check if invoice number already exists (unlikely but possible)
      const exists = await this.invoiceRepository.existsByNumber(invoiceNumber.getValue());
      if (exists) {
        throw new ConflictException('Invoice number already exists');
      }

      // Create value objects
      const clientId = ClientId.create(command.clientId);
      const issuedBy = UserId.create(command.issuedBy);
      const projectId = command.projectId ? ProjectId.create(command.projectId) : undefined;

      // Create invoice aggregate
      const invoice = InvoiceAggregate.create({
        number: invoiceNumber,
        clientId,
        projectId,
        issuedBy,
        type: command.type,
        currency: command.currency,
        dueDate: command.dueDate,
        frequency: command.frequency,
        notes: command.notes,
      });

      // Add items if provided
      if (command.items && command.items.length > 0) {
        for (const item of command.items) {
          const unitPrice = new Money(item.unitPrice, command.currency);
          const taxRate = item.taxRate ? new TaxRate(item.taxRate, 'SALES_TAX') : new TaxRate(0, 'NO_TAX');
          
          const invoiceItem = new InvoiceItem(
            item.description,
            item.quantity,
            unitPrice,
            taxRate,
          );
          
          invoice.addItem(invoiceItem);
        }
      }

      // Save invoice
      await this.invoiceRepository.save(invoice);

      this.logger.log(`Invoice created: ${invoiceNumber.getValue()}`);

      return {
        id: invoice.id,
        number: invoiceNumber.getValue(),
      };
    } catch (error) {
      this.logger.error('Failed to create invoice', error);
      throw error;
    }
  }
}
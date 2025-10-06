import { Injectable } from '@nestjs/common';
import { InvoiceAggregate, LineItem } from '@billing/domain/aggregates/invoice.aggregate';
import { InvoiceRepository } from '@billing/domain/repositories/invoice.repository';
import { Money } from '@billing/domain/value-objects/money';
import { TaxRate } from '@billing/domain/value-objects/tax-rate';
import { EventBus } from '@shared/kernel';
import { DomainException } from '@shared/kernel';

export interface CreateInvoiceCommand {
  clientId: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    currency: string;
    taxRate?: {
      rate: number;
      name: string;
    };
  }[];
  notes?: string;
}

export interface CreateInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  total: {
    amount: number;
    currency: string;
  };
}

@Injectable()
export class CreateInvoiceUseCase {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly eventBus: EventBus
  ) {}

  async execute(command: CreateInvoiceCommand): Promise<CreateInvoiceResult> {
    // Check if invoice number already exists
    const existingInvoice = await this.invoiceRepository.findByInvoiceNumber(command.invoiceNumber);
    if (existingInvoice) {
      throw new DomainException(`Invoice with number ${command.invoiceNumber} already exists`);
    }

    // Convert command to domain objects
    const lineItems = command.lineItems.map(item => {
      const unitPrice = new Money(item.unitPrice, item.currency);
      const taxRate = item.taxRate ? new TaxRate(item.taxRate.rate, item.taxRate.name) : undefined;
      
      return new LineItem(
        item.description,
        item.quantity,
        unitPrice,
        taxRate
      );
    });

    // Create the invoice aggregate
    const invoice = InvoiceAggregate.create(
      command.clientId,
      command.invoiceNumber,
      command.issueDate,
      command.dueDate,
      lineItems,
      command.notes
    );

    // Save the invoice
    await this.invoiceRepository.save(invoice);

    // Publish domain events
    const events = invoice.getUncommittedEvents();
    await this.eventBus.publishMany(events);
    invoice.clearEvents();

    // Return result
    const total = invoice.calculateTotal();
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      total: {
        amount: total.amount,
        currency: total.currency
      }
    };
  }
}
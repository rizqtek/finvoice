import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InvoiceRepository } from '../../domain/repositories/invoice.repository';
import { InvoiceAggregate } from '../../domain/aggregates/invoice.aggregate';
import { InvoiceItem } from '../../domain/entities/invoice-item.entity';
import { Invoice, InvoiceDocument } from '../schemas/invoice.schema';
import { InvoiceNumber } from '../../domain/value-objects/invoice-number';
import { Money } from '../../domain/value-objects/money';
import { TaxRate } from '../../domain/value-objects/tax-rate';
import { ClientId } from '../../../../shared/kernel/value-objects/client-id';
import { ProjectId } from '../../../../shared/kernel/value-objects/project-id';
import { UserId } from '../../../../shared/kernel/value-objects/user-id';
import { InvoiceStatus, InvoiceType, InvoiceFrequency } from '../../domain/enums/invoice.enums';

@Injectable()
export class MongoInvoiceRepository implements InvoiceRepository {
  private readonly logger = new Logger(MongoInvoiceRepository.name);

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
  ) {}

  async save(invoice: InvoiceAggregate): Promise<void> {
    try {
      const invoiceData = {
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
        updatedAt: new Date(),
      };

      if (invoice.id) {
        await this.invoiceModel.findByIdAndUpdate(invoice.id, invoiceData);
      } else {
        const newInvoice = new this.invoiceModel(invoiceData);
        await newInvoice.save();
        // Set the ID on the aggregate
        (invoice as any)._id = newInvoice._id.toString();
      }

      this.logger.log(`Invoice saved: ${invoice.number.getValue()}`);
    } catch (error) {
      this.logger.error(`Failed to save invoice: ${invoice.number.getValue()}`, error);
      throw error;
    }
  }

  async findById(id: string): Promise<InvoiceAggregate | null> {
    try {
      const invoice = await this.invoiceModel.findById(id).exec();
      return invoice ? this.toDomain(invoice) : null;
    } catch (error) {
      this.logger.error(`Failed to find invoice by ID: ${id}`, error);
      throw error;
    }
  }

  async findByNumber(number: string): Promise<InvoiceAggregate | null> {
    try {
      const invoice = await this.invoiceModel.findOne({ number }).exec();
      return invoice ? this.toDomain(invoice) : null;
    } catch (error) {
      this.logger.error(`Failed to find invoice by number: ${number}`, error);
      throw error;
    }
  }

  async findByClientId(clientId: string): Promise<InvoiceAggregate[]> {
    try {
      const invoices = await this.invoiceModel.find({ clientId }).exec();
      return invoices.map(invoice => this.toDomain(invoice));
    } catch (error) {
      this.logger.error(`Failed to find invoices by client ID: ${clientId}`, error);
      throw error;
    }
  }

  async findByStatus(status: InvoiceStatus): Promise<InvoiceAggregate[]> {
    try {
      const invoices = await this.invoiceModel.find({ status }).exec();
      return invoices.map(invoice => this.toDomain(invoice));
    } catch (error) {
      this.logger.error(`Failed to find invoices by status: ${status}`, error);
      throw error;
    }
  }

  async findOverdue(): Promise<InvoiceAggregate[]> {
    try {
      const invoices = await this.invoiceModel.find({
        status: { $in: [InvoiceStatus.SENT] },
        dueDate: { $lt: new Date() },
      }).exec();
      return invoices.map(invoice => this.toDomain(invoice));
    } catch (error) {
      this.logger.error('Failed to find overdue invoices', error);
      throw error;
    }
  }

  async findDraftsByUser(userId: string): Promise<InvoiceAggregate[]> {
    try {
      const invoices = await this.invoiceModel.find({
        issuedBy: userId,
        status: InvoiceStatus.DRAFT,
      }).exec();
      return invoices.map(invoice => this.toDomain(invoice));
    } catch (error) {
      this.logger.error(`Failed to find draft invoices by user: ${userId}`, error);
      throw error;
    }
  }

  async existsByNumber(number: string): Promise<boolean> {
    try {
      const count = await this.invoiceModel.countDocuments({ number });
      return count > 0;
    } catch (error) {
      this.logger.error(`Failed to check invoice existence by number: ${number}`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.invoiceModel.findByIdAndDelete(id);
      this.logger.log(`Invoice deleted: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete invoice: ${id}`, error);
      throw error;
    }
  }

  private toDomain(invoice: InvoiceDocument): InvoiceAggregate {
    const aggregate = new InvoiceAggregate(
      InvoiceNumber.fromString(invoice.number),
      ClientId.create(invoice.clientId.toString()),
      UserId.create(invoice.issuedBy.toString()),
      invoice.type,
      invoice.currency,
      invoice.dueDate,
      invoice.projectId ? ProjectId.create(invoice.projectId.toString()) : undefined,
      invoice.frequency,
      invoice.notes,
      invoice._id.toString(),
    );

    // Restore aggregate state
    (aggregate as any)._status = invoice.status;
    (aggregate as any)._finalizedAt = invoice.finalizedAt;
    (aggregate as any)._sentAt = invoice.sentAt;
    (aggregate as any)._paidAt = invoice.paidAt;
    (aggregate as any)._voidedAt = invoice.voidedAt;
    (aggregate as any)._paidAmount = invoice.paidAmount ? 
      new Money(invoice.paidAmount.amount, invoice.paidAmount.currency) : undefined;
    (aggregate as any)._voidReason = invoice.voidReason;

    // Restore items
    if (invoice.items && invoice.items.length > 0) {
      invoice.items.forEach(item => {
        const invoiceItem = new InvoiceItem(
          item.description,
          item.quantity,
          new Money(item.unitPrice.amount, item.unitPrice.currency),
          item.taxRate ? new TaxRate(item.taxRate.rate, item.taxRate.type) : TaxRate.noTax(),
          item.id
        );
        aggregate.addItem(invoiceItem);
      });
    }

    return aggregate;
  }
}
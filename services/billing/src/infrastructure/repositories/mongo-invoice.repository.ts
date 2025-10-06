import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invoice, InvoiceDocument } from '../schemas/invoice.schema';

@Injectable()
export class MongoInvoiceRepository {
  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>
  ) {}

  async save(invoiceData: any): Promise<void> {
    if (invoiceData._id) {
      await this.invoiceModel.findByIdAndUpdate(
        invoiceData._id,
        { $set: invoiceData },
        { upsert: true, new: true }
      );
    } else {
      const newInvoice = new this.invoiceModel(invoiceData);
      await newInvoice.save();
    }
  }

  async findById(id: string): Promise<InvoiceDocument | null> {
    return this.invoiceModel.findById(id).exec();
  }

  async findByInvoiceNumber(invoiceNumber: string): Promise<InvoiceDocument | null> {
    return this.invoiceModel.findOne({ invoiceNumber }).exec();
  }

  async findByCustomerId(customerId: string): Promise<InvoiceDocument[]> {
    return this.invoiceModel
      .find({ customerId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOverdueInvoices(): Promise<InvoiceDocument[]> {
    const today = new Date();
    return this.invoiceModel
      .find({
        status: { $in: ['sent', 'viewed'] },
        dueDate: { $lt: today }
      })
      .sort({ dueDate: 1 })
      .exec();
  }

  async delete(id: string): Promise<void> {
    await this.invoiceModel.findByIdAndDelete(id).exec();
  }
}
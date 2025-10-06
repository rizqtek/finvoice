import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument } from '../schemas/payment.schema';

@Injectable()
export class MongoPaymentRepository {
  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>
  ) {}

  async save(paymentData: any): Promise<void> {
    if (paymentData._id) {
      await this.paymentModel.findByIdAndUpdate(
        paymentData._id,
        { $set: paymentData },
        { upsert: true, new: true }
      );
    } else {
      const newPayment = new this.paymentModel(paymentData);
      await newPayment.save();
    }
  }

  async findById(id: string): Promise<PaymentDocument | null> {
    return this.paymentModel.findById(id).exec();
  }

  async findByPaymentId(paymentId: string): Promise<PaymentDocument | null> {
    return this.paymentModel.findOne({ paymentId }).exec();
  }

  async findByInvoiceId(invoiceId: string): Promise<PaymentDocument[]> {
    return this.paymentModel
      .find({ invoiceId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByCustomerId(customerId: string): Promise<PaymentDocument[]> {
    return this.paymentModel
      .find({ customerId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByGatewayTransactionId(transactionId: string): Promise<PaymentDocument | null> {
    return this.paymentModel.findOne({ gatewayTransactionId: transactionId }).exec();
  }

  async delete(id: string): Promise<void> {
    await this.paymentModel.findByIdAndDelete(id).exec();
  }
}
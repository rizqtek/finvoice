import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentDocument = Payment & Document;

@Schema({ 
  collection: 'payments',
  timestamps: true,
  versionKey: false 
})
export class Payment {
  @Prop({ type: Types.ObjectId, auto: true })
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true })
  paymentId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Invoice' })
  invoiceId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Client' })
  customerId: Types.ObjectId;

  @Prop({ 
    required: true,
    type: {
      amount: { type: Number, required: true },
      currency: { type: String, required: true, default: 'USD' }
    }
  })
  amount: {
    amount: number;
    currency: string;
  };

  @Prop({ 
    required: true, 
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending'
  })
  status: string;

  @Prop({ 
    required: true, 
    enum: ['stripe', 'razorpay', 'paypal', 'bank_transfer', 'cash', 'check']
  })
  method: string;

  @Prop({ type: String })
  gatewayTransactionId?: string;

  @Prop({ type: String })
  gatewayReference?: string;

  @Prop({ type: Object })
  gatewayMetadata?: Record<string, any>;

  @Prop({ type: Date })
  processedAt?: Date;

  @Prop({ type: Date })
  failedAt?: Date;

  @Prop({ type: String })
  failureReason?: string;

  @Prop({ type: String, maxlength: 1000 })
  notes?: string;

  @Prop({ type: [String], default: [] })
  domainEvents: string[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

// Indexes for better query performance
PaymentSchema.index({ invoiceId: 1 });
PaymentSchema.index({ customerId: 1, status: 1 });
PaymentSchema.index({ paymentId: 1 });
PaymentSchema.index({ gatewayTransactionId: 1 });
PaymentSchema.index({ createdAt: -1 });
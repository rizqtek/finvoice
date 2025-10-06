import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { InvoiceStatus, InvoiceType, InvoiceFrequency } from '../../domain/enums/invoice.enums';

export type InvoiceDocument = Invoice & Document;

@Schema({
  collection: 'invoices',
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class Invoice {
  @Prop({ required: true, unique: true })
  number: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Client' })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project' })
  projectId?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  issuedBy: Types.ObjectId;

  @Prop({ required: true, enum: InvoiceType })
  type: InvoiceType;

  @Prop({ required: true, enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Prop({ required: true })
  currency: string;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ enum: InvoiceFrequency })
  frequency?: InvoiceFrequency;

  @Prop()
  notes?: string;

  @Prop({ type: [Object], default: [] })
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: {
      amount: number;
      currency: string;
    };
    taxRate?: {
      rate: number;
      type: string;
    };
    total: {
      amount: number;
      currency: string;
    };
  }>;

  @Prop({ type: Object })
  totals: {
    subtotal: {
      amount: number;
      currency: string;
    };
    totalTax: {
      amount: number;
      currency: string;
    };
    total: {
      amount: number;
      currency: string;
    };
  };

  @Prop()
  finalizedAt?: Date;

  @Prop()
  sentAt?: Date;

  @Prop()
  paidAt?: Date;

  @Prop()
  voidedAt?: Date;

  @Prop({ type: Object })
  paidAmount?: {
    amount: number;
    currency: string;
  };

  @Prop()
  voidReason?: string;

  @Prop()
  pdfPath?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
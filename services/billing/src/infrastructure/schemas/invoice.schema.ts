import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InvoiceDocument = Invoice & Document;

@Schema({ 
  collection: 'invoices',
  timestamps: true,
  versionKey: false 
})
export class Invoice {
  @Prop({ type: Types.ObjectId, auto: true })
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true })
  invoiceNumber: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Client' })
  customerId: Types.ObjectId;

  @Prop({ required: true, type: Date })
  issueDate: Date;

  @Prop({ required: true, type: Date })
  dueDate: Date;

  @Prop({ 
    required: true, 
    enum: ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'],
    default: 'draft'
  })
  status: string;

  @Prop({ 
    type: [{
      description: { type: String, required: true },
      quantity: { type: Number, required: true },
      unitPrice: { 
        amount: { type: Number, required: true },
        currency: { type: String, required: true, default: 'USD' }
      },
      total: { 
        amount: { type: Number, required: true },
        currency: { type: String, required: true, default: 'USD' }
      }
    }],
    required: true
  })
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: {
      amount: number;
      currency: string;
    };
    total: {
      amount: number;
      currency: string;
    };
  }>;

  @Prop({ 
    type: [{
      taxRate: {
        name: { type: String, required: true },
        percentage: { type: Number, required: true }
      },
      amount: { 
        amount: { type: Number, required: true },
        currency: { type: String, required: true, default: 'USD' }
      }
    }],
    default: []
  })
  taxLines: Array<{
    taxRate: {
      name: string;
      percentage: number;
    };
    amount: {
      amount: number;
      currency: string;
    };
  }>;

  @Prop({ 
    required: true,
    type: {
      amount: { type: Number, required: true },
      currency: { type: String, required: true, default: 'USD' }
    }
  })
  subtotal: {
    amount: number;
    currency: string;
  };

  @Prop({ 
    required: true,
    type: {
      amount: { type: Number, required: true },
      currency: { type: String, required: true, default: 'USD' }
    }
  })
  totalAmount: {
    amount: number;
    currency: string;
  };

  @Prop({ type: String, maxlength: 1000 })
  notes?: string;

  @Prop({ type: String, maxlength: 500 })
  terms?: string;

  @Prop({ type: Date })
  sentAt?: Date;

  @Prop({ type: Date })
  viewedAt?: Date;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ type: [String], default: [] })
  domainEvents: string[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

// Indexes for better query performance
InvoiceSchema.index({ customerId: 1, status: 1 });
InvoiceSchema.index({ invoiceNumber: 1 });
InvoiceSchema.index({ dueDate: 1, status: 1 });
InvoiceSchema.index({ createdAt: -1 });
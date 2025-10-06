import { InvoiceAggregate } from '../../src/modules/billing/domain/aggregates/invoice.aggregate';
import { InvoiceItem } from '../../src/modules/billing/domain/entities/invoice-item.entity';
import { InvoiceNumber } from '../../src/modules/billing/domain/value-objects/invoice-number';
import { Money } from '../../src/modules/billing/domain/value-objects/money';
import { TaxRate } from '../../src/modules/billing/domain/value-objects/tax-rate';
import { InvoiceStatus, InvoiceType } from '../../src/modules/billing/domain/enums/invoice.enums';
import { ClientId } from '../../src/shared/kernel/value-objects/client-id';
import { UserId } from '../../src/shared/kernel/value-objects/user-id';
import { DomainException } from '../../src/shared/kernel/exceptions/domain.exception';

describe('InvoiceAggregate', () => {
  let invoice: InvoiceAggregate;
  let invoiceNumber: InvoiceNumber;
  let clientId: ClientId;
  let userId: UserId;
  let futureDate: Date;

  beforeEach(() => {
    invoiceNumber = InvoiceNumber.generate('INV');
    clientId = ClientId.create('test-client-123');
    userId = UserId.create('test-user-456');
    futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    invoice = new InvoiceAggregate(
      invoiceNumber,
      clientId,
      userId,
      InvoiceType.STANDARD,
      'USD',
      futureDate
    );
  });

  describe('constructor', () => {
    it('should create a new invoice with valid data', () => {
      expect(invoice.id).toBeDefined();
      expect(invoice.number).toBe(invoiceNumber);
      expect(invoice.clientId).toBe(clientId);
      expect(invoice.issuedBy).toBe(userId);
      expect(invoice.type).toBe(InvoiceType.STANDARD);
      expect(invoice.currency).toBe('USD');
      expect(invoice.dueDate).toBe(futureDate);
      expect(invoice.status).toBe(InvoiceStatus.DRAFT);
      expect(invoice.items).toHaveLength(0);
    });

    it('should throw error for past due date', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      
      expect(() => {
        new InvoiceAggregate(
          invoiceNumber,
          clientId,
          userId,
          InvoiceType.STANDARD,
          'USD',
          pastDate
        );
      }).toThrow(DomainException);
    });
  });

  describe('item management', () => {
    let item: InvoiceItem;

    beforeEach(() => {
      const taxRate = new TaxRate(8.25, 'SALES_TAX');
      item = new InvoiceItem('Web Development', 1, new Money(1000, 'USD'), taxRate);
    });

    it('should add item to draft invoice', () => {
      invoice.addItem(item);
      
      expect(invoice.items).toHaveLength(1);
      expect(invoice.items[0]).toBe(item);
    });

    it('should throw error when adding item with different currency', () => {
      const taxRate = new TaxRate(8.25, 'SALES_TAX');
      const eurItem = new InvoiceItem('Service', 1, new Money(100, 'EUR'), taxRate);
      
      expect(() => {
        invoice.addItem(eurItem);
      }).toThrow(DomainException);
    });

    it('should remove item from draft invoice', () => {
      invoice.addItem(item);
      expect(invoice.items).toHaveLength(1);
      
      invoice.removeItem(item.id);
      expect(invoice.items).toHaveLength(0);
    });

    it('should throw error when removing non-existent item', () => {
      expect(() => {
        invoice.removeItem('non-existent-id');
      }).toThrow(DomainException);
    });
  });

  describe('calculations', () => {
    beforeEach(() => {
      const taxRate = new TaxRate(10.0, 'SALES_TAX');
      const item1 = new InvoiceItem('Service A', 2, new Money(100, 'USD'), taxRate);
      const item2 = new InvoiceItem('Service B', 1, new Money(50, 'USD'), taxRate);
      
      invoice.addItem(item1);
      invoice.addItem(item2);
    });

    it('should calculate subtotal correctly', () => {
      const subtotal = invoice.calculateSubtotal();
      expect(subtotal.amount).toBe(250); // (100 * 2) + (50 * 1)
      expect(subtotal.currency).toBe('USD');
    });

    it('should calculate total tax correctly', () => {
      const totalTax = invoice.calculateTotalTax();
      expect(totalTax.amount).toBe(25); // 250 * 0.10
      expect(totalTax.currency).toBe('USD');
    });

    it('should calculate total correctly', () => {
      const total = invoice.calculateTotal();
      expect(total.amount).toBe(275); // 250 + 25
      expect(total.currency).toBe('USD');
    });
  });

  describe('lifecycle management', () => {
    beforeEach(() => {
      const taxRate = new TaxRate(0, 'NO_TAX');
      const item = new InvoiceItem('Service', 1, new Money(1000, 'USD'), taxRate);
      invoice.addItem(item);
    });

    it('should finalize draft invoice', () => {
      invoice.finalize();
      
      expect(invoice.status).toBe(InvoiceStatus.FINALIZED);
      expect(invoice.finalizedAt).toBeDefined();
    });

    it('should send finalized invoice', () => {
      invoice.finalize();
      invoice.send();
      
      expect(invoice.status).toBe(InvoiceStatus.SENT);
      expect(invoice.sentAt).toBeDefined();
    });

    it('should record payment for sent invoice', () => {
      invoice.finalize();
      invoice.send();
      
      const paymentAmount = invoice.calculateTotal();
      invoice.recordPayment(paymentAmount);
      
      expect(invoice.status).toBe(InvoiceStatus.PAID);
      expect(invoice.paidAt).toBeDefined();
      expect(invoice.paidAmount?.equals(paymentAmount)).toBe(true);
    });

    it('should mark as paid with correct amount', () => {
      invoice.finalize();
      invoice.send();
      
      const totalAmount = invoice.calculateTotal();
      invoice.markAsPaid(totalAmount);
      
      expect(invoice.status).toBe(InvoiceStatus.PAID);
    });

    it('should throw error when marking as paid with incorrect amount', () => {
      invoice.finalize();
      invoice.send();
      
      const wrongAmount = new Money(500, 'USD');
      
      expect(() => {
        invoice.markAsPaid(wrongAmount);
      }).toThrow(DomainException);
    });

    it('should void invoice', () => {
      const reason = 'Customer cancelled order';
      invoice.void(reason);
      
      expect(invoice.status).toBe(InvoiceStatus.VOID);
      expect(invoice.voidReason).toBe(reason);
      expect(invoice.voidedAt).toBeDefined();
    });

    it('should throw error when voiding paid invoice', () => {
      invoice.finalize();
      invoice.send();
      
      const totalAmount = invoice.calculateTotal();
      invoice.markAsPaid(totalAmount);
      
      expect(() => {
        invoice.void('Test reason');
      }).toThrow(DomainException);
    });
  });

  describe('static create method', () => {
    it('should create invoice using static method', () => {
      const params = {
        number: InvoiceNumber.generate('TEST'),
        clientId: ClientId.create('client-789'),
        issuedBy: UserId.create('user-123'),
        type: InvoiceType.STANDARD,
        currency: 'USD',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      const createdInvoice = InvoiceAggregate.create(params);
      
      expect(createdInvoice.number).toBe(params.number);
      expect(createdInvoice.clientId).toBe(params.clientId);
      expect(createdInvoice.issuedBy).toBe(params.issuedBy);
      expect(createdInvoice.type).toBe(params.type);
      expect(createdInvoice.currency).toBe(params.currency);
      expect(createdInvoice.dueDate).toBe(params.dueDate);
    });
  });
});
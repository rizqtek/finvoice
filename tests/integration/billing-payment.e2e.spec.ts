import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { CreateInvoiceDto, SendInvoiceDto, MarkInvoicePaidDto } from '../../services/billing/src/api/dtos/invoice.dto';

describe('Billing-Payment Integration (e2e)', () => {
  let app: INestApplication;
  let invoiceId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Invoice to Payment Flow', () => {
    it('should create an invoice successfully', async () => {
      const createInvoiceDto: CreateInvoiceDto = {
        clientId: 'client_123',
        invoiceNumber: 'INV-E2E-001',
        issueDate: '2024-01-15',
        dueDate: '2024-02-15',
        lineItems: [
          {
            description: 'Web Development Services',
            quantity: 1,
            unitPrice: 1000,
            currency: 'USD',
            taxRate: {
              rate: 0.08,
              name: 'Sales Tax'
            }
          },
          {
            description: 'Domain Registration',
            quantity: 1,
            unitPrice: 15,
            currency: 'USD'
          }
        ],
        notes: 'Payment due within 30 days'
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send(createInvoiceDto)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('invoiceId');
      expect(response.body.data).toHaveProperty('invoiceNumber', 'INV-E2E-001');
      expect(response.body.data.total.amount).toBe(1095); // 1000 + 80 tax + 15
      expect(response.body.data.total.currency).toBe('USD');

      invoiceId = response.body.data.invoiceId;
    });

    it('should retrieve the created invoice', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(invoiceId);
      expect(response.body.data.status).toBe('DRAFT');
      expect(response.body.data.calculations.total.amount).toBe(1095);
      expect(response.body.data.calculations.taxLines).toHaveLength(1);
      expect(response.body.data.calculations.taxLines[0].amount.amount).toBe(80);
    });

    it('should send the invoice to client', async () => {
      const sendInvoiceDto: SendInvoiceDto = {
        email: 'client@example.com'
      };

      const response = await request(app.getHttpServer())
        .put(`/api/v1/invoices/${invoiceId}/send`)
        .send(sendInvoiceDto)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('SENT');
      expect(response.body.data.sentAt).toBeDefined();
    });

    it('should verify invoice status is SENT', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceId}`)
        .expect(200);

      expect(response.body.data.status).toBe('SENT');
      expect(response.body.data.sentAt).toBeDefined();
    });

    it('should simulate Stripe payment webhook', async () => {
      const stripeWebhookPayload = {
        id: 'evt_test_webhook',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_payment',
            amount: 109500, // Stripe uses cents
            currency: 'usd',
            status: 'succeeded',
            metadata: {
              invoice_id: invoiceId,
              payment_id: 'payment_123'
            }
          }
        }
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(stripeWebhookPayload)
        .expect(200);

      expect(response.body.received).toBe(true);
    });

    it('should mark invoice as paid manually', async () => {
      const markPaidDto: MarkInvoicePaidDto = {
        amount: 1095,
        currency: 'USD',
        paymentMethod: 'stripe'
      };

      const response = await request(app.getHttpServer())
        .put(`/api/v1/invoices/${invoiceId}/mark-paid`)
        .send(markPaidDto)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('PAID');
      expect(response.body.data.paidAt).toBeDefined();
      expect(response.body.data.paidAmount.amount).toBe(1095);
    });

    it('should verify final invoice status is PAID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceId}`)
        .expect(200);

      expect(response.body.data.status).toBe('PAID');
      expect(response.body.data.paidAt).toBeDefined();
      expect(response.body.data.paidAmount.amount).toBe(1095);
    });

    it('should list invoices with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/invoices?page=1&limit=10&status=PAID')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toBeInstanceOf(Array);
      expect(response.body.data.pagination).toHaveProperty('page', 1);
      expect(response.body.data.pagination).toHaveProperty('limit', 10);
      
      // Should include our test invoice
      const testInvoice = response.body.data.items.find(
        (inv: any) => inv.invoiceNumber === 'INV-E2E-001'
      );
      expect(testInvoice).toBeDefined();
      expect(testInvoice.status).toBe('PAID');
    });
  });

  describe('Error Handling', () => {
    it('should fail to create invoice with invalid data', async () => {
      const invalidDto = {
        clientId: '', // Invalid: empty string
        invoiceNumber: 'INV-INVALID-001',
        issueDate: '2024-01-15',
        dueDate: '2024-01-10', // Invalid: due date before issue date
        lineItems: [], // Invalid: empty array
      };

      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send(invalidDto)
        .expect(400);
    });

    it('should fail to create duplicate invoice number', async () => {
      const createInvoiceDto: CreateInvoiceDto = {
        clientId: 'client_123',
        invoiceNumber: 'INV-E2E-001', // Same as previously created
        issueDate: '2024-01-15',
        dueDate: '2024-02-15',
        lineItems: [
          {
            description: 'Test Service',
            quantity: 1,
            unitPrice: 100,
            currency: 'USD'
          }
        ]
      };

      await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send(createInvoiceDto)
        .expect(400);
    });

    it('should fail to mark already paid invoice as paid again', async () => {
      const markPaidDto: MarkInvoicePaidDto = {
        amount: 1095,
        currency: 'USD',
        paymentMethod: 'stripe'
      };

      await request(app.getHttpServer())
        .put(`/api/v1/invoices/${invoiceId}/mark-paid`)
        .send(markPaidDto)
        .expect(400);
    });

    it('should fail to send non-existent invoice', async () => {
      const sendInvoiceDto: SendInvoiceDto = {
        email: 'client@example.com'
      };

      await request(app.getHttpServer())
        .put('/api/v1/invoices/non-existent-id/send')
        .send(sendInvoiceDto)
        .expect(404);
    });
  });
});
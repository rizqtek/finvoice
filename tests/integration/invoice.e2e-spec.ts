import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { BillingModule } from '../../src/modules/billing/billing.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { JwtService } from '@nestjs/jwt';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';

describe('Invoice Integration Tests (e2e)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let connection: Connection;
  let jwtService: JwtService;
  let authToken: string;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test'
        }),
        MongooseModule.forRoot(mongoUri),
        AuthModule,
        BillingModule
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    jwtService = app.get<JwtService>(JwtService);

    // Create test user token
    authToken = jwtService.sign({
      sub: 'test-user-id',
      email: 'test@example.com',
      roles: ['admin']
    });
  });

  afterAll(async () => {
    await connection.close();
    await mongoServer.stop();
    await app.close();
  });

  beforeEach(async () => {
    // Clean database before each test
    const collections = connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  describe('Invoice Lifecycle', () => {
    it('should create, finalize, send, and process payment for invoice', async () => {
      // Step 1: Create a client
      const clientResponse = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Client Corp',
          email: 'client@testcorp.com',
          address: {
            street: '123 Business St',
            city: 'Business City',
            state: 'BC',
            postalCode: '12345',
            country: 'US'
          }
        })
        .expect(201);

      const clientId = clientResponse.body.id;

      // Step 2: Create a project
      const projectResponse = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Website Development',
          clientId: clientId,
          description: 'E-commerce website development',
          status: 'ACTIVE'
        })
        .expect(201);

      const projectId = projectResponse.body.id;

      // Step 3: Create invoice draft
      const invoiceCreateResponse = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId: clientId,
          projectId: projectId,
          type: 'STANDARD',
          currency: 'USD',
          dueDate: '2024-02-15',
          notes: 'Website development services'
        })
        .expect(201);

      const invoiceId = invoiceCreateResponse.body.id;
      expect(invoiceCreateResponse.body.status).toBe('DRAFT');

      // Step 4: Add items to invoice
      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Frontend Development - 40 hours',
          quantity: 40,
          unitPrice: 125,
          taxRate: 8.5
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Backend Development - 60 hours',
          quantity: 60,
          unitPrice: 150,
          taxRate: 8.5
        })
        .expect(201);

      // Step 5: Get invoice with items
      const invoiceWithItemsResponse = await request(app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(invoiceWithItemsResponse.body.items).toHaveLength(2);
      expect(invoiceWithItemsResponse.body.totals.subtotal).toBe(14000); // 40*125 + 60*150
      expect(invoiceWithItemsResponse.body.totals.tax).toBe(1190); // 14000 * 0.085
      expect(invoiceWithItemsResponse.body.totals.total).toBe(15190); // 14000 + 1190

      // Step 6: Finalize invoice
      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/finalize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const finalizedInvoiceResponse = await request(app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(finalizedInvoiceResponse.body.status).toBe('FINALIZED');
      expect(finalizedInvoiceResponse.body.finalizedAt).toBeDefined();

      // Step 7: Send invoice
      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/send`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const sentInvoiceResponse = await request(app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(sentInvoiceResponse.body.status).toBe('SENT');
      expect(sentInvoiceResponse.body.sentAt).toBeDefined();

      // Step 8: Process partial payment
      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 7500,
          currency: 'USD',
          paymentMethod: 'CREDIT_CARD',
          reference: 'partial-payment-ref-123'
        })
        .expect(201);

      const partialPaidInvoiceResponse = await request(app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(partialPaidInvoiceResponse.body.status).toBe('PARTIALLY_PAID');
      expect(partialPaidInvoiceResponse.body.paidAmount).toBe(7500);

      // Step 9: Process final payment
      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 7690, // Remaining amount
          currency: 'USD',
          paymentMethod: 'BANK_TRANSFER',
          reference: 'final-payment-ref-456'
        })
        .expect(201);

      const fullyPaidInvoiceResponse = await request(app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(fullyPaidInvoiceResponse.body.status).toBe('PAID');
      expect(fullyPaidInvoiceResponse.body.paidAmount).toBe(15190);
      expect(fullyPaidInvoiceResponse.body.paidAt).toBeDefined();
    });

    it('should handle invoice void scenario', async () => {
      // Create client and project (simplified)
      const clientResponse = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Client',
          email: 'test@client.com'
        })
        .expect(201);

      const projectResponse = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Project',
          clientId: clientResponse.body.id
        })
        .expect(201);

      // Create and finalize invoice
      const invoiceResponse = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId: clientResponse.body.id,
          projectId: projectResponse.body.id,
          type: 'STANDARD',
          currency: 'USD',
          dueDate: '2024-02-15'
        })
        .expect(201);

      const invoiceId = invoiceResponse.body.id;

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Service',
          quantity: 1,
          unitPrice: 1000,
          taxRate: 0
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/finalize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Void the invoice
      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/void`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reason: 'Customer cancelled order'
        })
        .expect(200);

      const voidedInvoiceResponse = await request(app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(voidedInvoiceResponse.body.status).toBe('VOID');
      expect(voidedInvoiceResponse.body.voidReason).toBe('Customer cancelled order');
      expect(voidedInvoiceResponse.body.voidedAt).toBeDefined();
    });
  });

  describe('Recurring Invoice Workflow', () => {
    it('should create and process recurring invoice with proration', async () => {
      // Create client
      const clientResponse = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Subscription Client',
          email: 'subscription@client.com'
        })
        .expect(201);

      // Create recurring invoice template
      const recurringInvoiceResponse = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId: clientResponse.body.id,
          type: 'RECURRING',
          frequency: 'MONTHLY',
          currency: 'USD',
          dueDate: '2024-02-01'
        })
        .expect(201);

      const recurringInvoiceId = recurringInvoiceResponse.body.id;

      // Add recurring items
      await request(app.getHttpServer())
        .post(`/invoices/${recurringInvoiceId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Monthly Subscription - Premium Plan',
          quantity: 1,
          unitPrice: 299,
          taxRate: 8.5
        })
        .expect(201);

      // Generate prorated invoice for partial month
      const proratedInvoiceResponse = await request(app.getHttpServer())
        .post(`/invoices/${recurringInvoiceId}/prorate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          startDate: '2024-01-15',
          endDate: '2024-01-31'
        })
        .expect(201);

      const proratedInvoice = proratedInvoiceResponse.body;
      
      // Verify proration (17 days out of 31 = ~54.84%)
      const expectedAmount = Math.round(299 * (17 / 31) * 100) / 100;
      expect(Math.abs(proratedInvoice.totals.subtotal - expectedAmount * 100)).toBeLessThan(1);

      // Finalize and send prorated invoice
      await request(app.getHttpServer())
        .post(`/invoices/${proratedInvoice.id}/finalize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/invoices/${proratedInvoice.id}/send`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  describe('Invoice Validation and Error Handling', () => {
    it('should validate required fields', async () => {
      await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
          type: 'STANDARD'
        })
        .expect(400);
    });

    it('should prevent finalizing invoice without items', async () => {
      const clientResponse = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Client',
          email: 'test@client.com'
        })
        .expect(201);

      const invoiceResponse = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId: clientResponse.body.id,
          type: 'STANDARD',
          currency: 'USD',
          dueDate: '2024-02-15'
        })
        .expect(201);

      // Try to finalize without items
      await request(app.getHttpServer())
        .post(`/invoices/${invoiceResponse.body.id}/finalize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should prevent payment with wrong currency', async () => {
      const clientResponse = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Client',
          email: 'test@client.com'
        })
        .expect(201);

      const invoiceResponse = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId: clientResponse.body.id,
          type: 'STANDARD',
          currency: 'USD',
          dueDate: '2024-02-15'
        })
        .expect(201);

      const invoiceId = invoiceResponse.body.id;

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Service',
          quantity: 1,
          unitPrice: 1000,
          taxRate: 0
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/finalize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/send`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Try to pay with wrong currency
      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1000,
          currency: 'EUR', // Wrong currency
          paymentMethod: 'CREDIT_CARD'
        })
        .expect(400);
    });

    it('should handle overpayment scenario', async () => {
      const clientResponse = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Client',
          email: 'test@client.com'
        })
        .expect(201);

      const invoiceResponse = await request(app.getHttpServer())
        .post('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId: clientResponse.body.id,
          type: 'STANDARD',
          currency: 'USD',
          dueDate: '2024-02-15'
        })
        .expect(201);

      const invoiceId = invoiceResponse.body.id;

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Service',
          quantity: 1,
          unitPrice: 1000,
          taxRate: 0
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/finalize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/send`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Process overpayment
      const overpaymentResponse = await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/payments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1500, // $500 overpayment
          currency: 'USD',
          paymentMethod: 'CREDIT_CARD'
        })
        .expect(201);

      const invoiceAfterOverpayment = await request(app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(invoiceAfterOverpayment.body.status).toBe('OVERPAID');
      expect(invoiceAfterOverpayment.body.paidAmount).toBe(1500);
      expect(overpaymentResponse.body.overpaymentAmount).toBe(500);
    });
  });

  describe('Invoice Search and Filtering', () => {
    it('should search invoices by status and date range', async () => {
      // Create test data
      const clientResponse = await request(app.getHttpServer())
        .post('/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Search Test Client',
          email: 'search@test.com'
        })
        .expect(201);

      const clientId = clientResponse.body.id;

      // Create multiple invoices with different statuses
      const invoiceIds = [];
      for (let i = 0; i < 3; i++) {
        const invoiceResponse = await request(app.getHttpServer())
          .post('/invoices')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            clientId: clientId,
            type: 'STANDARD',
            currency: 'USD',
            dueDate: '2024-02-15'
          })
          .expect(201);

        invoiceIds.push(invoiceResponse.body.id);
      }

      // Finalize one invoice
      await request(app.getHttpServer())
        .post(`/invoices/${invoiceIds[0]}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Service',
          quantity: 1,
          unitPrice: 1000,
          taxRate: 0
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceIds[0]}/finalize`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Search for draft invoices
      const draftInvoicesResponse = await request(app.getHttpServer())
        .get('/invoices')
        .query({ status: 'DRAFT' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(draftInvoicesResponse.body.data.length).toBe(2);

      // Search for finalized invoices
      const finalizedInvoicesResponse = await request(app.getHttpServer())
        .get('/invoices')
        .query({ status: 'FINALIZED' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(finalizedInvoicesResponse.body.data.length).toBe(1);
    });
  });
});
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { PaymentModule } from '../../src/modules/payment/payment.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { JwtService } from '@nestjs/jwt';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';

describe('Payment Integration Tests (e2e)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let connection: Connection;
  let jwtService: JwtService;
  let authToken: string;

  beforeAll(async () => {
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
        PaymentModule
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    jwtService = app.get<JwtService>(JwtService);

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
    const collections = connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  describe('Payment Processing Workflow', () => {
    it('should process Stripe credit card payment successfully', async () => {
      // Create payment intent
      const paymentIntentResponse = await request(app.getHttpServer())
        .post('/payments/intents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 5000, // $50.00
          currency: 'USD',
          provider: 'STRIPE',
          paymentMethod: 'CREDIT_CARD',
          metadata: {
            invoiceId: 'invoice-123',
            clientId: 'client-456'
          }
        })
        .expect(201);

      expect(paymentIntentResponse.body.provider).toBe('STRIPE');
      expect(paymentIntentResponse.body.amount).toBe(5000);
      expect(paymentIntentResponse.body.status).toBe('PENDING');
      expect(paymentIntentResponse.body.clientSecret).toBeDefined();

      const paymentIntentId = paymentIntentResponse.body.id;

      // Simulate successful payment webhook from Stripe
      await request(app.getHttpServer())
        .post('/payments/webhooks/stripe')
        .send({
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: paymentIntentResponse.body.providerPaymentId,
              amount: 5000,
              currency: 'usd',
              status: 'succeeded',
              metadata: {
                paymentIntentId: paymentIntentId
              }
            }
          }
        })
        .expect(200);

      // Verify payment status updated
      const updatedPaymentResponse = await request(app.getHttpServer())
        .get(`/payments/${paymentIntentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(updatedPaymentResponse.body.status).toBe('COMPLETED');
      expect(updatedPaymentResponse.body.completedAt).toBeDefined();
    });

    it('should handle PayPal payment flow', async () => {
      // Create PayPal payment
      const paypalPaymentResponse = await request(app.getHttpServer())
        .post('/payments/intents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 7500, // $75.00
          currency: 'USD',
          provider: 'PAYPAL',
          paymentMethod: 'PAYPAL',
          metadata: {
            invoiceId: 'invoice-789'
          }
        })
        .expect(201);

      expect(paypalPaymentResponse.body.provider).toBe('PAYPAL');
      expect(paypalPaymentResponse.body.approvalUrl).toBeDefined();

      const paymentId = paypalPaymentResponse.body.id;

      // Simulate PayPal approval
      await request(app.getHttpServer())
        .post(`/payments/${paymentId}/approve`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          payerId: 'PAYPAL_PAYER_ID_123',
          paymentId: 'PAYPAL_PAYMENT_ID_456'
        })
        .expect(200);

      // Execute PayPal payment
      await request(app.getHttpServer())
        .post(`/payments/${paymentId}/execute`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          payerId: 'PAYPAL_PAYER_ID_123'
        })
        .expect(200);

      // Verify payment completed
      const completedPaymentResponse = await request(app.getHttpServer())
        .get(`/payments/${paymentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(completedPaymentResponse.body.status).toBe('COMPLETED');
    });

    it('should process bank transfer payment', async () => {
      // Create bank transfer payment
      const bankTransferResponse = await request(app.getHttpServer())
        .post('/payments/intents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 10000, // $100.00
          currency: 'USD',
          provider: 'BANK_TRANSFER',
          paymentMethod: 'BANK_TRANSFER',
          bankDetails: {
            accountNumber: 'ACC123456789',
            routingNumber: 'RTN987654321',
            bankName: 'Test Bank'
          },
          metadata: {
            invoiceId: 'invoice-bank-123'
          }
        })
        .expect(201);

      expect(bankTransferResponse.body.status).toBe('PENDING_BANK_TRANSFER');

      const paymentId = bankTransferResponse.body.id;

      // Simulate bank transfer confirmation
      await request(app.getHttpServer())
        .post(`/payments/${paymentId}/confirm-bank-transfer`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transactionReference: 'BANK_REF_789456123',
          confirmationCode: 'CONF_ABC123'
        })
        .expect(200);

      // Verify payment status
      const confirmedPaymentResponse = await request(app.getHttpServer())
        .get(`/payments/${paymentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(confirmedPaymentResponse.body.status).toBe('COMPLETED');
      expect(confirmedPaymentResponse.body.transactionReference).toBe('BANK_REF_789456123');
    });
  });

  describe('Payment Failure Scenarios', () => {
    it('should handle Stripe payment failure', async () => {
      const paymentIntentResponse = await request(app.getHttpServer())
        .post('/payments/intents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 3000,
          currency: 'USD',
          provider: 'STRIPE',
          paymentMethod: 'CREDIT_CARD'
        })
        .expect(201);

      const paymentIntentId = paymentIntentResponse.body.id;

      // Simulate failed payment webhook
      await request(app.getHttpServer())
        .post('/payments/webhooks/stripe')
        .send({
          type: 'payment_intent.payment_failed',
          data: {
            object: {
              id: paymentIntentResponse.body.providerPaymentId,
              amount: 3000,
              currency: 'usd',
              status: 'requires_payment_method',
              last_payment_error: {
                code: 'card_declined',
                message: 'Your card was declined.'
              },
              metadata: {
                paymentIntentId: paymentIntentId
              }
            }
          }
        })
        .expect(200);

      // Verify payment status updated to failed
      const failedPaymentResponse = await request(app.getHttpServer())
        .get(`/payments/${paymentIntentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(failedPaymentResponse.body.status).toBe('FAILED');
      expect(failedPaymentResponse.body.failureReason).toContain('card_declined');
    });

    it('should handle PayPal payment cancellation', async () => {
      const paypalPaymentResponse = await request(app.getHttpServer())
        .post('/payments/intents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 5000,
          currency: 'USD',
          provider: 'PAYPAL',
          paymentMethod: 'PAYPAL'
        })
        .expect(201);

      const paymentId = paypalPaymentResponse.body.id;

      // Cancel PayPal payment
      await request(app.getHttpServer())
        .post(`/payments/${paymentId}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reason: 'User cancelled payment'
        })
        .expect(200);

      // Verify payment cancelled
      const cancelledPaymentResponse = await request(app.getHttpServer())
        .get(`/payments/${paymentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(cancelledPaymentResponse.body.status).toBe('CANCELLED');
      expect(cancelledPaymentResponse.body.cancellationReason).toBe('User cancelled payment');
    });
  });

  describe('Payment Refund Workflow', () => {
    it('should process full refund successfully', async () => {
      // Create and complete payment first
      const paymentResponse = await request(app.getHttpServer())
        .post('/payments/intents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 8000,
          currency: 'USD',
          provider: 'STRIPE',
          paymentMethod: 'CREDIT_CARD'
        })
        .expect(201);

      const paymentId = paymentResponse.body.id;

      // Simulate payment success
      await request(app.getHttpServer())
        .post('/payments/webhooks/stripe')
        .send({
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: paymentResponse.body.providerPaymentId,
              amount: 8000,
              currency: 'usd',
              status: 'succeeded',
              metadata: {
                paymentIntentId: paymentId
              }
            }
          }
        })
        .expect(200);

      // Process full refund
      const refundResponse = await request(app.getHttpServer())
        .post(`/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 8000, // Full refund
          reason: 'Customer requested refund'
        })
        .expect(201);

      expect(refundResponse.body.amount).toBe(8000);
      expect(refundResponse.body.reason).toBe('Customer requested refund');
      expect(refundResponse.body.status).toBe('PENDING');

      // Simulate refund webhook
      await request(app.getHttpServer())
        .post('/payments/webhooks/stripe')
        .send({
          type: 'charge.refund.updated',
          data: {
            object: {
              id: refundResponse.body.providerRefundId,
              amount: 8000,
              currency: 'usd',
              status: 'succeeded',
              charge: paymentResponse.body.providerPaymentId
            }
          }
        })
        .expect(200);

      // Verify refund completed
      const refundStatusResponse = await request(app.getHttpServer())
        .get(`/payments/${paymentId}/refunds/${refundResponse.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(refundStatusResponse.body.status).toBe('COMPLETED');
    });

    it('should process partial refund', async () => {
      // Create and complete payment
      const paymentResponse = await request(app.getHttpServer())
        .post('/payments/intents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 10000,
          currency: 'USD',
          provider: 'STRIPE',
          paymentMethod: 'CREDIT_CARD'
        })
        .expect(201);

      const paymentId = paymentResponse.body.id;

      // Complete payment
      await request(app.getHttpServer())
        .post('/payments/webhooks/stripe')
        .send({
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: paymentResponse.body.providerPaymentId,
              amount: 10000,
              currency: 'usd',
              status: 'succeeded',
              metadata: {
                paymentIntentId: paymentId
              }
            }
          }
        })
        .expect(200);

      // Process partial refund (30%)
      const partialRefundResponse = await request(app.getHttpServer())
        .post(`/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 3000, // Partial refund
          reason: 'Partial service cancellation'
        })
        .expect(201);

      expect(partialRefundResponse.body.amount).toBe(3000);

      // Complete refund
      await request(app.getHttpServer())
        .post('/payments/webhooks/stripe')
        .send({
          type: 'charge.refund.updated',
          data: {
            object: {
              id: partialRefundResponse.body.providerRefundId,
              amount: 3000,
              currency: 'usd',
              status: 'succeeded',
              charge: paymentResponse.body.providerPaymentId
            }
          }
        })
        .expect(200);

      // Verify payment status shows partial refund
      const paymentAfterRefundResponse = await request(app.getHttpServer())
        .get(`/payments/${paymentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(paymentAfterRefundResponse.body.refundedAmount).toBe(3000);
      expect(paymentAfterRefundResponse.body.status).toBe('PARTIALLY_REFUNDED');
    });
  });

  describe('Payment Reconciliation', () => {
    it('should reconcile payments with bank statements', async () => {
      // Create multiple payments
      const payment1 = await request(app.getHttpServer())
        .post('/payments/intents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 5000,
          currency: 'USD',
          provider: 'STRIPE',
          paymentMethod: 'CREDIT_CARD',
          metadata: { invoiceId: 'inv-001' }
        })
        .expect(201);

      const payment2 = await request(app.getHttpServer())
        .post('/payments/intents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 7500,
          currency: 'USD',
          provider: 'STRIPE',
          paymentMethod: 'CREDIT_CARD',
          metadata: { invoiceId: 'inv-002' }
        })
        .expect(201);

      // Complete both payments
      for (const payment of [payment1, payment2]) {
        await request(app.getHttpServer())
          .post('/payments/webhooks/stripe')
          .send({
            type: 'payment_intent.succeeded',
            data: {
              object: {
                id: payment.body.providerPaymentId,
                amount: payment.body.amount,
                currency: 'usd',
                status: 'succeeded',
                metadata: {
                  paymentIntentId: payment.body.id
                }
              }
            }
          })
          .expect(200);
      }

      // Upload bank statement for reconciliation
      const bankStatementData = [
        {
          date: '2024-01-15',
          amount: 5000,
          description: 'STRIPE PAYMENT',
          reference: payment1.body.providerPaymentId
        },
        {
          date: '2024-01-16',
          amount: 7500,
          description: 'STRIPE PAYMENT',
          reference: payment2.body.providerPaymentId
        }
      ];

      const reconciliationResponse = await request(app.getHttpServer())
        .post('/payments/reconcile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          bankStatements: bankStatementData,
          reconciliationDate: '2024-01-16'
        })
        .expect(200);

      expect(reconciliationResponse.body.totalReconciled).toBe(2);
      expect(reconciliationResponse.body.reconciledAmount).toBe(12500);
      expect(reconciliationResponse.body.unmatchedPayments).toHaveLength(0);
    });

    it('should identify unmatched payments in reconciliation', async () => {
      // Create payment that won't match bank statement
      const payment = await request(app.getHttpServer())
        .post('/payments/intents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 2500,
          currency: 'USD',
          provider: 'STRIPE',
          paymentMethod: 'CREDIT_CARD'
        })
        .expect(201);

      // Complete payment
      await request(app.getHttpServer())
        .post('/payments/webhooks/stripe')
        .send({
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: payment.body.providerPaymentId,
              amount: 2500,
              currency: 'usd',
              status: 'succeeded',
              metadata: {
                paymentIntentId: payment.body.id
              }
            }
          }
        })
        .expect(200);

      // Bank statement with different amount
      const bankStatementData = [
        {
          date: '2024-01-15',
          amount: 3000, // Different amount
          description: 'STRIPE PAYMENT',
          reference: payment.body.providerPaymentId
        }
      ];

      const reconciliationResponse = await request(app.getHttpServer())
        .post('/payments/reconcile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          bankStatements: bankStatementData,
          reconciliationDate: '2024-01-15'
        })
        .expect(200);

      expect(reconciliationResponse.body.totalReconciled).toBe(0);
      expect(reconciliationResponse.body.unmatchedPayments).toHaveLength(1);
      expect(reconciliationResponse.body.unmatchedBankEntries).toHaveLength(1);
    });
  });

  describe('Payment Analytics and Reporting', () => {
    it('should generate payment analytics for date range', async () => {
      // Create test payments with different statuses
      const payments = await Promise.all([
        request(app.getHttpServer())
          .post('/payments/intents')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            amount: 5000,
            currency: 'USD',
            provider: 'STRIPE',
            paymentMethod: 'CREDIT_CARD'
          }),
        request(app.getHttpServer())
          .post('/payments/intents')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            amount: 7500,
            currency: 'USD',
            provider: 'PAYPAL',
            paymentMethod: 'PAYPAL'
          }),
        request(app.getHttpServer())
          .post('/payments/intents')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            amount: 3000,
            currency: 'USD',
            provider: 'STRIPE',
            paymentMethod: 'CREDIT_CARD'
          })
      ]);

      // Complete first two payments
      for (let i = 0; i < 2; i++) {
        const payment = payments[i];
        await request(app.getHttpServer())
          .post('/payments/webhooks/stripe')
          .send({
            type: 'payment_intent.succeeded',
            data: {
              object: {
                id: payment.body.providerPaymentId,
                amount: payment.body.amount,
                currency: 'usd',
                status: 'succeeded',
                metadata: {
                  paymentIntentId: payment.body.id
                }
              }
            }
          });
      }

      // Get payment analytics
      const analyticsResponse = await request(app.getHttpServer())
        .get('/payments/analytics')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(analyticsResponse.body.totalPayments).toBe(3);
      expect(analyticsResponse.body.completedPayments).toBe(2);
      expect(analyticsResponse.body.totalAmount).toBe(15500);
      expect(analyticsResponse.body.completedAmount).toBe(12500);
      expect(analyticsResponse.body.averagePaymentAmount).toBeDefined();
      expect(analyticsResponse.body.paymentMethodBreakdown).toBeDefined();
      expect(analyticsResponse.body.providerBreakdown).toBeDefined();
    });
  });
});
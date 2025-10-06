import 'reflect-metadata';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer;

// Global setup for integration tests
beforeAll(async () => {
  // Start in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Set environment variables for tests
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URL = mongoUri;
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.JWT_SECRET = 'test-jwt-secret-key';
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
  process.env.PAYPAL_CLIENT_ID = 'test_client_id';
  process.env.PAYPAL_CLIENT_SECRET = 'test_client_secret';
  process.env.EMAIL_HOST = 'localhost';
  process.env.EMAIL_PORT = '587';
  process.env.EMAIL_USER = 'test@example.com';
  process.env.EMAIL_PASS = 'test-password';
}, 60000);

afterAll(async () => {
  // Stop MongoDB instance
  if (mongoServer) {
    await mongoServer.stop();
  }
}, 30000);

// Test utilities for integration tests
global.integrationTestUtils = {
  generateTestEmail: () => `test-${Date.now()}@example.com`,
  
  generateTestUser: () => ({
    email: global.integrationTestUtils.generateTestEmail(),
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User'
  }),
  
  generateTestClient: () => ({
    name: `Test Client ${Date.now()}`,
    email: global.integrationTestUtils.generateTestEmail(),
    address: {
      street: '123 Test St',
      city: 'Test City',
      state: 'TS',
      postalCode: '12345',
      country: 'US'
    }
  }),
  
  generateTestInvoice: (clientId: string, projectId?: string) => ({
    clientId,
    projectId: projectId || 'test-project-id',
    type: 'STANDARD',
    currency: 'USD',
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
  }),
  
  generateTestInvoiceItem: () => ({
    description: `Test Service ${Date.now()}`,
    quantity: Math.floor(Math.random() * 10) + 1,
    unitPrice: Math.floor(Math.random() * 1000) + 100,
    taxRate: Math.floor(Math.random() * 15)
  })
};
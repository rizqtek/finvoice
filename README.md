# 🧾 Finvoice - Financial Management & Automated Invoicing System

[![CI/CD Pipeline](https://github.com/yourusername/finvoice/workflows/CI%2FCD%20Pipeline/badge.svg)](https://github.com/yourusername/finvoice/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.1+-blue.svg)](https://www.typescriptlang.org/)

A production-grade financial management and automated invoicing system built with **Domain-Driven Design (DDD)** patterns using Node.js, TypeScript, NestJS, and MongoDB.

## 🌟 Features

### 📋 Core Modules
- **🧾 Billing & Invoicing** - Create, send, and manage invoices with automated recurring billing
- **💳 Payment Processing** - Multi-gateway support (Stripe, Razorpay, PayPal) with webhook handling
- **💰 Expense Management** - Receipt upload with OCR, approval workflows, and expense tracking
- **⏰ Time & Mileage** - Time tracking with project integration and mileage logging
- **👥 Client Management** - Customer profiles, billing addresses, and project assignments
- **🔐 Authentication & Authorization** - JWT-based auth with role-based access control (RBAC)
- **📊 Reports & Analytics** - Financial dashboards, profit/loss statements, and custom reports
- **📧 Notifications** - Email, SMS, and push notification system with templates

### 🏗️ Architecture Features
- **Domain-Driven Design (DDD)** with bounded contexts
- **Event-driven architecture** with domain events and background jobs
- **Microservices-ready** structure with Redis event bus
- **CQRS patterns** for complex business operations
- **Comprehensive testing** with unit and integration tests
- **Docker containerization** for easy deployment
- **CI/CD pipeline** with GitHub Actions

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- MongoDB 7+
- Redis 7+

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/finvoice.git
cd finvoice
```

### 2. Environment Setup
```bash
# Copy environment variables
cp .env.sample .env

# Install dependencies
npm install
```

### 3. Start Development Environment
```bash
# Start infrastructure services (MongoDB, Redis, MinIO, MailHog)
npm run docker:dev

# Start the application in development mode
npm run start:dev
```

### 4. Access the Application
- **API Server**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api/docs
- **Database**: MongoDB on localhost:27017
- **Email Testing**: MailHog UI on http://localhost:8025
- **File Storage**: MinIO on http://localhost:9001

## 📖 API Documentation

### 🧾 Invoice Management

#### Create Invoice
```bash
POST /api/v1/invoices
Content-Type: application/json

{
  "clientId": "client_123",
  "invoiceNumber": "INV-2024-001",
  "issueDate": "2024-01-15",
  "dueDate": "2024-02-15",
  "lineItems": [
    {
      "description": "Web Development Services",
      "quantity": 1,
      "unitPrice": 1000,
      "currency": "USD",
      "taxRate": {
        "rate": 0.08,
        "name": "Sales Tax"
      }
    }
  ],
  "notes": "Payment due within 30 days"
}
```

#### Send Invoice
```bash
PUT /api/v1/invoices/{invoiceId}/send
Content-Type: application/json

{
  "email": "client@example.com"
}
```

#### Mark Invoice as Paid
```bash
PUT /api/v1/invoices/{invoiceId}/mark-paid
Content-Type: application/json

{
  "amount": 1080.00,
  "currency": "USD",
  "paymentMethod": "stripe"
}
```

### 💳 Payment Webhooks

#### Stripe Webhook
```bash
POST /api/v1/webhooks/stripe
Content-Type: application/json
Stripe-Signature: {signature}

{
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_test_payment",
      "amount": 108000,
      "currency": "usd",
      "status": "succeeded",
      "metadata": {
        "invoice_id": "invoice_123"
      }
    }
  }
}
```

## 🧪 Testing

### Run All Tests
```bash
# Unit tests
npm run test

# Integration tests
npm run test:e2e

# Test coverage
npm run test:cov

# Watch mode
npm run test:watch
```

### Domain Logic Tests
```bash
# Test invoice calculations
npm run test -- --testNamePattern="Invoice.*calculation"

# Test expense approval workflow
npm run test -- --testNamePattern="Expense.*approval"

# Test payment processing
npm run test -- --testNamePattern="Payment.*process"
```

## 🐳 Docker Deployment

### Development
```bash
# Start all services
docker-compose -f infra/docker-compose.dev.yml up -d

# View logs
docker-compose -f infra/docker-compose.dev.yml logs -f finvoice
```

### Production
```bash
# Build production image
docker build -t finvoice:latest .

# Run with production config
docker run -d \
  --name finvoice \
  -p 3000:3000 \
  --env-file .env.production \
  finvoice:latest
```

## 🏗️ Project Structure

```
finvoice/
├── 📁 services/                    # Bounded contexts (DDD modules)
│   ├── 📁 billing/                 # Billing & Invoicing
│   │   ├── 📁 src/domain/          # Domain layer (entities, aggregates, events)
│   │   ├── 📁 src/application/     # Application layer (use cases)
│   │   └── 📁 src/api/             # API layer (controllers, DTOs)
│   ├── 📁 payments/                # Payment processing
│   ├── 📁 expenses/                # Expense management
│   ├── 📁 auth/                    # Authentication
│   ├── 📁 clients/                 # Client management
│   ├── 📁 reports/                 # Reports & analytics
│   └── 📁 notifications/           # Notification system
├── 📁 shared/                      # Shared kernel
│   └── 📁 kernel/                  # Common domain patterns
├── 📁 src/                         # Main application
│   ├── 📄 app.module.ts            # Root module
│   ├── 📄 main.ts                  # Application entry point
│   └── 📁 modules/                 # Feature modules
├── 📁 tests/                       # Test suites
│   └── 📁 integration/             # E2E tests
├── 📁 infra/                       # Infrastructure
│   ├── 📄 docker-compose.dev.yml   # Development services
│   └── 📄 init-mongo.js            # Database initialization
├── 📁 docs/                        # Documentation
└── 📁 .github/workflows/           # CI/CD pipelines
```

## 🔧 Configuration

### Environment Variables
Key environment variables you need to configure:

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/finvoice
REDIS_URL=redis://localhost:6379

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret

# Payment Gateways
STRIPE_SECRET_KEY=sk_test_your_stripe_key
RAZORPAY_KEY_ID=rzp_test_your_razorpay_key
PAYPAL_CLIENT_ID=your_paypal_client_id

# OCR Service
OCR_PROVIDER=tesseract
GOOGLE_VISION_PROJECT_ID=your_project_id

# Email Service
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=noreply@finvoice.com
```

### Feature Flags
```bash
ENABLE_RECURRING_BILLING=true
ENABLE_OCR=true
ENABLE_PDF_GENERATION=true
ENABLE_EMAIL_NOTIFICATIONS=true
```

## 🔄 Background Jobs

The system uses BullMQ for background job processing:

### Available Jobs
- **📧 Invoice Reminders** - Automated email reminders for overdue invoices
- **🔄 Recurring Billing** - Generate and send recurring invoices
- **📄 PDF Generation** - Generate PDF invoices and reports
- **🔍 OCR Processing** - Extract data from uploaded receipts
- **📊 Report Generation** - Generate scheduled financial reports

### Start Worker Process
```bash
# Start background worker
npm run worker
```

## 🧩 Architecture Patterns

### Domain-Driven Design (DDD)
- **Aggregates**: InvoiceAggregate, PaymentAggregate, ExpenseReportAggregate
- **Value Objects**: Money, TaxRate, Address
- **Domain Events**: InvoiceCreated, PaymentProcessed, ExpenseApproved
- **Domain Services**: TaxCalculationService, RecurringBillingService

### Event-Driven Architecture
```typescript
// Domain Event Example
export class InvoicePaidEvent extends DomainEvent {
  constructor(
    public readonly invoiceId: string,
    public readonly paidAmount: number,
    public readonly paidAt: Date
  ) {
    super(invoiceId);
  }
}

// Event Handler Example
@EventHandler(InvoicePaidEvent)
export class SendPaymentReceiptHandler {
  async handle(event: InvoicePaidEvent) {
    await this.emailService.sendPaymentReceipt(event.invoiceId);
  }
}
```

## 🔌 Extending the System

### Adding a New Payment Gateway

1. **Create Gateway Adapter**:
```typescript
export class CustomPaymentGateway implements PaymentGateway {
  async processPayment(amount: Money, card: CreditCard): Promise<PaymentResult> {
    // Implementation
  }
}
```

2. **Register in Module**:
```typescript
@Module({
  providers: [
    {
      provide: 'PAYMENT_GATEWAYS',
      useFactory: () => [
        new StripeGateway(),
        new CustomPaymentGateway(), // Add your gateway
      ],
    },
  ],
})
export class PaymentsModule {}
```

### Adding OCR Provider

1. **Implement OCR Interface**:
```typescript
export class GoogleVisionOCR implements OCRService {
  async extractText(imageBuffer: Buffer): Promise<OCRResult> {
    // Google Vision API implementation
  }
}
```

2. **Configure Provider**:
```bash
OCR_PROVIDER=google_vision
GOOGLE_VISION_PROJECT_ID=your_project_id
```

## 📊 Monitoring & Observability

### Health Checks
```bash
GET /api/v1/health
```

### Metrics Endpoints
```bash
GET /api/v1/metrics        # Prometheus metrics
GET /api/v1/health/db      # Database health
GET /api/v1/health/redis   # Redis health
```

### Logging
- **Structured JSON logging** with correlation IDs
- **Request/response logging** with timing
- **Error tracking** with stack traces
- **Business event logging** for audit trails

## 🚀 Deployment

### Environment-Specific Configurations

#### Staging
```bash
# Deploy to staging
docker-compose -f docker-compose.staging.yml up -d

# Migrate database
npm run migrate:staging
```

#### Production
```bash
# Build production image
docker build -t finvoice:v1.0.0 .

# Deploy with Kubernetes
kubectl apply -f k8s/production/

# Or deploy with Docker Swarm
docker stack deploy -c docker-compose.production.yml finvoice
```

### Database Migrations & Backups

#### Backup Database
```bash
# MongoDB backup
mongodump --uri="mongodb://localhost:27017/finvoice" --out=./backups/$(date +%Y%m%d)

# Automated backup script
./scripts/backup-database.sh
```

#### Restore Database
```bash
# MongoDB restore
mongorestore --uri="mongodb://localhost:27017/finvoice" ./backups/20240115/finvoice

# Restore script
./scripts/restore-database.sh 20240115
```

## 🤝 Contributing

### Development Workflow
1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feat/amazing-feature`
3. **Commit changes**: `git commit -m 'Add amazing feature'`
4. **Push to branch**: `git push origin feat/amazing-feature`
5. **Open Pull Request**

### Code Standards
- **TypeScript strict mode** enabled
- **ESLint + Prettier** for code formatting
- **Conventional Commits** for commit messages
- **100% test coverage** for domain logic
- **Documentation** for all public APIs

### Branch Strategy
- `main` - Production releases
- `develop` - Development branch
- `feat/*` - Feature branches
- `fix/*` - Bug fix branches
- `hotfix/*` - Critical production fixes

## 📝 Changelog

### v1.0.0 (2024-01-15)
- ✨ Initial release with core invoicing functionality
- 🎉 Multi-gateway payment processing
- 📱 Expense management with OCR
- 🔐 JWT authentication with RBAC
- 📊 Financial reporting dashboard
- 🐳 Docker containerization
- 🚀 CI/CD pipeline with GitHub Actions

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Documentation
- **API Docs**: http://localhost:3000/api/docs
- **Architecture Guide**: [docs/architecture.md](docs/architecture.md)
- **Deployment Guide**: [docs/deployment.md](docs/deployment.md)

### Community
- **GitHub Issues**: [Report bugs and request features](https://github.com/yourusername/finvoice/issues)
- **Discussions**: [Community discussions](https://github.com/yourusername/finvoice/discussions)
- **Discord**: [Join our Discord server](https://discord.gg/finvoice)

### Commercial Support
For enterprise support, custom development, and consulting services, please contact us at [support@finvoice.com](mailto:support@finvoice.com).

---

**Made with ❤️ by the Finvoice Team**

[![Built with NestJS](https://img.shields.io/badge/Built%20with-NestJS-red.svg)](https://nestjs.com/)
[![Powered by TypeScript](https://img.shields.io/badge/Powered%20by-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB-green.svg)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Cache-Redis-red.svg)](https://redis.io/)
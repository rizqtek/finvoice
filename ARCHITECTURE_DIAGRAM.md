# Finvoice System - Architecture & Flow Diagram

## Overview
This diagram illustrates the modular architecture and data flow of the Finvoice financial management platform, including API, application, domain, infrastructure, and external systems.

---

## Mermaid Diagram (Copy to [Mermaid Live Editor](https://mermaid.live/))

```mermaid
graph TD
  subgraph API Layer
    A1[AuthController]
    A2[InvoicesController]
    A3[PaymentsController]
    A4[ExpensesController]
    A5[ClientsController]
    A6[ReportsController]
    A7[NotificationsController]
    A8[AdminController]
  end

  subgraph Application Layer
    B1[AuthService]
    B2[CreateInvoiceUseCase]
    B3[GetInvoiceUseCase]
    B4[ListInvoicesUseCase]
    B5[PaymentService]
    B6[ExpenseService]
    B7[ClientService]
    B8[ReportService]
    B9[NotificationService]
    B10[AdminService]
  end

  subgraph Domain Layer
    C1[User Aggregate]
    C2[Invoice Aggregate]
    C3[Payment Aggregate]
    C4[Expense Aggregate]
    C5[Client Aggregate]
    C6[Report Aggregate]
    C7[Notification Entity]
    C8[Role/Permission Entity]
    C9[Value Objects (Money, TaxRate, etc.)]
  end

  subgraph Infrastructure Layer
    D1[MongoInvoiceRepository]
    D2[MongoUserRepository]
    D3[MongoPaymentRepository]
    D4[MongoExpenseRepository]
    D5[MongoClientRepository]
    D6[MongoReportRepository]
    D7[NotificationAdapter]
    D8[RedisCache]
    D9[JobQueue (BullMQ)]
    D10[External Payment Gateway]
    D11[Email/SMS Provider]
  end

  subgraph External Systems
    E1[MongoDB]
    E2[Redis]
    E3[SMTP/Email]
    E4[SMS Gateway]
    E5[Payment Gateway (Stripe, PayPal)]
  end

  %% API Layer to Application Layer
  A1 --> B1
  A2 --> B2
  A2 --> B3
  A2 --> B4
  A3 --> B5
  A4 --> B6
  A5 --> B7
  A6 --> B8
  A7 --> B9
  A8 --> B10

  %% Application Layer to Domain Layer
  B1 --> C1
  B2 --> C2
  B3 --> C2
  B4 --> C2
  B5 --> C3
  B6 --> C4
  B7 --> C5
  B8 --> C6
  B9 --> C7
  B10 --> C8

  %% Domain Layer to Infrastructure Layer
  C1 --> D2
  C2 --> D1
  C3 --> D3
  C4 --> D4
  C5 --> D5
  C6 --> D6
  C7 --> D7
  C8 --> D2

  %% Infrastructure Layer to External Systems
  D1 --> E1
  D2 --> E1
  D3 --> E1
  D4 --> E1
  D5 --> E1
  D6 --> E1
  D7 --> E3
  D7 --> E4
  D8 --> E2
  D9 --> E2
  D10 --> E5
  D11 --> E3
  D11 --> E4

  %% Event/Job Flow
  B2 --Domain Event--> D9
  B5 --Payment Event--> D10
  B9 --Notification Event--> D7

  %% Health/Monitoring
  A8 --Health Check--> D8
```

---

## Flow Summary
- **API Layer:** Receives HTTP requests, routes to application services/use cases.
- **Application Layer:** Handles business logic, orchestrates domain aggregates/entities.
- **Domain Layer:** Pure business logic, aggregates, entities, value objects.
- **Infrastructure Layer:** Data persistence, external integrations, caching, job queues.
- **External Systems:** Databases, cache, email/SMS, payment gateways.

---

## How to Use
- Copy the Mermaid code above into [Mermaid Live Editor](https://mermaid.live/) or your diagram tool.
- Customize node names, colors, and add more details as needed.

---

## Contact
For support or business inquiries, contact [info@rizqtek.com](mailto:info@rizqtek.com)

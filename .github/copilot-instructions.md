# Finvoice Project - GitHub Copilot Instructions

This is a production-grade Financial Management & Automated Invoicing System built with Node.js, TypeScript, NestJS, and MongoDB following Domain-Driven Design (DDD) patterns.

## Project Structure
- **Monorepo architecture** with bounded contexts as NestJS modules
- **Domain-Driven Design** with clear separation of domain, application, and infrastructure layers
- **Event-driven architecture** with domain events and background jobs
- **Microservices-ready** structure with Redis event bus

## Key Technologies
- Node.js 20+ with TypeScript
- NestJS framework with modules
- MongoDB with Mongoose ODM
- Redis for caching and job queues
- BullMQ for background jobs
- JWT authentication with RBAC
- Docker and docker-compose for local development

## Bounded Contexts (NestJS Modules)
1. **Billing** - Invoicing, templates, recurring billing
2. **Payments** - Gateway adapters, reconciliation
3. **Expenses** - Receipt upload, OCR, approval workflows
4. **Time & Mileage** - Time tracking, trip logging
5. **Clients & Projects** - Customer and project management
6. **Auth & Accounts** - Authentication and user management
7. **Reports & Analytics** - Financial reporting
8. **Notifications** - Email, SMS, push notifications

## Development Guidelines
- Follow DDD principles with pure domain layer
- Use dependency injection for all external dependencies
- Implement domain events for cross-context communication
- Write comprehensive unit and integration tests
- Use TypeScript strict mode and proper typing
- Follow NestJS best practices and conventions

✅ **Status: Project scaffolding completed**
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';

// Constants
import { BILLING_TOKENS } from './constants';

// Infrastructure
import { Invoice, InvoiceSchema } from './infrastructure/schemas/invoice.schema';
import { MongoInvoiceRepository } from './infrastructure/repositories/mongo-invoice.repository';

// Application
import { CreateInvoiceUseCase } from './application/use-cases/create-invoice-new.usecase';
import { GetInvoiceUseCase } from './application/use-cases/get-invoice.usecase';
import { ListInvoicesUseCase } from './application/use-cases/list-invoices.usecase';

// API
import { InvoicesController } from './api/controllers/invoices.controller';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
    ]),
  ],
  controllers: [InvoicesController],
  providers: [
    // Repository implementation
    {
      provide: BILLING_TOKENS.INVOICE_REPOSITORY,
      useClass: MongoInvoiceRepository,
    },
    // Use cases
    CreateInvoiceUseCase,
    GetInvoiceUseCase,
    ListInvoicesUseCase,
  ],
  exports: [
    BILLING_TOKENS.INVOICE_REPOSITORY,
    CreateInvoiceUseCase,
    GetInvoiceUseCase,
    ListInvoicesUseCase,
  ],
})
export class BillingModule {}
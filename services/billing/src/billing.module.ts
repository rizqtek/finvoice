import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { Invoice, InvoiceSchema } from './infrastructure/schemas/invoice.schema';
import { MongoInvoiceRepository } from './infrastructure/repositories/mongo-invoice.repository';
import { SendInvoiceJobHandler, GenerateInvoicePdfJobHandler } from './application/jobs/invoice-job-handlers';
import { InvoicesController } from './api/controllers/invoices.controller';
import { CreateInvoiceUseCase } from './application/use-cases/create-invoice.usecase';
import { UpdateInvoiceUseCase } from './application/use-cases/update-invoice.usecase';
import { GetInvoiceUseCase } from './application/use-cases/get-invoice.usecase';
import { DeleteInvoiceUseCase } from './application/use-cases/delete-invoice.usecase';
import { ListInvoicesUseCase } from './application/use-cases/list-invoices.usecase';
import { SendInvoiceUseCase } from './application/use-cases/send-invoice.usecase';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema }
    ])
  ],
  controllers: [
    InvoicesController,
  ],
  providers: [
    MongoInvoiceRepository,
    CreateInvoiceUseCase,
    UpdateInvoiceUseCase,
    GetInvoiceUseCase,
    DeleteInvoiceUseCase,
    ListInvoicesUseCase,
    SendInvoiceUseCase,
    SendInvoiceJobHandler,
    GenerateInvoicePdfJobHandler,
  ],
  exports: [
    MongoInvoiceRepository,
    CreateInvoiceUseCase,
    UpdateInvoiceUseCase,
    GetInvoiceUseCase,
    DeleteInvoiceUseCase,
    ListInvoicesUseCase,
    SendInvoiceUseCase,
    SendInvoiceJobHandler,
    GenerateInvoicePdfJobHandler,
  ],
})
export class BillingModule {}
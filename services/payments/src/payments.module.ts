import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { Payment, PaymentSchema } from './infrastructure/schemas/payment.schema';
import { MongoPaymentRepository } from './infrastructure/repositories/mongo-payment.repository';
import { PaymentRepository } from './domain/repositories/payment.repository';
import { PaymentsController } from './api/controllers/payments.controller';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema }
    ])
  ],
  controllers: [
    PaymentsController,
  ],
  providers: [
    MongoPaymentRepository,
  ],
  exports: [
    MongoPaymentRepository,
  ],
})
export class PaymentsModule {}
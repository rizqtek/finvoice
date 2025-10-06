import { Module } from '@nestjs/common';
import { InfrastructureModule } from './shared/infrastructure/infrastructure.module';
import { BillingModule } from './modules/billing/billing.module';
import { AuthModule } from './modules/auth/auth.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthController } from './shared/controllers/health.controller';

@Module({
  imports: [
    InfrastructureModule,
    AuthModule,
    AdminModule,
    BillingModule,
    PaymentModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
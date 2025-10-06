import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisEventBus } from './event-bus/redis-event-bus';
import { BullMQService } from './jobs/bullmq.service';
import { EventBus } from '@shared/kernel/event-bus';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    MongooseModule.forRoot('mongodb://localhost:27017/finvoice'),
  ],
  providers: [
    {
      provide: 'EventBus',
      useClass: RedisEventBus,
    },
    BullMQService,
  ],
  exports: [
    'EventBus',
    BullMQService,
    MongooseModule,
    ConfigModule,
  ],
})
export class InfrastructureModule {}
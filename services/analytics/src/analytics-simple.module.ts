import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DashboardController } from './controllers/dashboard.controller';
import { ReportsController } from './controllers/reports.controller';
import { DashboardService } from './services/dashboard.service';
import { ReportsService } from './services/reports.service';
import { PredictionService } from './services/prediction.service';
import { RealTimeService } from './services/realtime.service';
import { DataProcessingService } from './services/data-processing.service';
import { MetricsService } from './services/metrics.service';
import { AlertService } from './services/alert.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.analytics', '.env'],
    })
  ],
  controllers: [
    DashboardController,
    ReportsController
  ],
  providers: [
    DashboardService,
    ReportsService,
    PredictionService,
    RealTimeService,
    DataProcessingService,
    MetricsService,
    AlertService
  ],
  exports: [
    DashboardService,
    ReportsService,
    PredictionService,
    RealTimeService,
    DataProcessingService,
    MetricsService,
    AlertService
  ]
})
export class AnalyticsModule {}
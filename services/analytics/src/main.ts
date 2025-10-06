import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WsAdapter } from '@nestjs/platform-ws';
import { AnalyticsModule } from './analytics-simple.module';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';

async function bootstrap() {
  const logger = new Logger('Analytics-Bootstrap');
  
  // Create HTTP application
  const app = await NestFactory.create(AnalyticsModule);
  
  // Security middleware
  app.use(helmet());
  app.use(compression());
  app.use(cors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  }));
  
  // Rate limiting
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP',
  }));
  
  // WebSocket adapter for real-time features
  app.useWebSocketAdapter(new WsAdapter(app));
  
  // Global pipes
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));
  
  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Finvoice Analytics API')
    .setDescription('Advanced Analytics & ML API for financial insights')
    .setVersion('2.0')
    .addBearerAuth()
    .addTag('analytics', 'Financial Analytics Operations')
    .addTag('ml', 'Machine Learning Predictions')
    .addTag('realtime', 'Real-time Dashboards')
    .addTag('reports', 'Advanced Reporting')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  
  // Start HTTP server
  const httpPort = process.env.ANALYTICS_PORT || 3005;
  await app.listen(httpPort);
  logger.log(`🚀 Analytics HTTP Server running on port ${httpPort}`);
  
  // Create microservice for inter-service communication
  const microservice = await NestFactory.createMicroservice<MicroserviceOptions>(AnalyticsModule, {
    transport: Transport.REDIS,
    options: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryAttempts: 5,
      retryDelay: 3000,
    },
  });
  
  await microservice.listen();
  logger.log(`🔗 Analytics Microservice connected to Redis`);
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.log('📤 Shutting down Analytics service...');
    await app.close();
    await microservice.close();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  Logger.error('❌ Failed to start Analytics service:', error);
  process.exit(1);
});
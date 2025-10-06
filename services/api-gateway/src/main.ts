import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiGatewayModule } from './api-gateway.module';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';

async function bootstrap() {
  const logger = new Logger('API-Gateway-Bootstrap');
  
  const app = await NestFactory.create(ApiGatewayModule);
  const configService = app.get(ConfigService);
  
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));
  
  app.use(compression());
  
  // CORS configuration
  app.use(cors({
    origin: configService.get('CORS_ORIGINS')?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400 // 24 hours
  }));
  
  // Global rate limiting
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000, // limit each IP to 5000 requests per windowMs
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      statusCode: 429
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        statusCode: 429,
        timestamp: new Date().toISOString()
      });
    }
  }));
  
  // Global pipes
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    disableErrorMessages: configService.get('NODE_ENV') === 'production',
    validationError: {
      target: false,
      value: false
    }
  }));
  
  // API Documentation
  const config = new DocumentBuilder()
    .setTitle('Finvoice API Gateway')
    .setDescription('Enterprise API Gateway for Finvoice Financial Management System')
    .setVersion('2.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'JWT',
      description: 'Enter JWT token',
      in: 'header',
    })
    .addApiKey({
      type: 'apiKey',
      name: 'X-API-Key',
      in: 'header',
      description: 'API Key for service-to-service communication'
    })
    .addServer(configService.get('API_BASE_URL') || 'http://localhost:3000', 'Development')
    .addServer('https://api.finvoice.com', 'Production')
    .addTag('auth', 'Authentication & Authorization')
    .addTag('billing', 'Billing & Invoicing')
    .addTag('payments', 'Payment Processing')
    .addTag('analytics', 'Advanced Analytics & ML')
    .addTag('gateway', 'API Gateway Management')
    .build();
  
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey
  });
  
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true
    },
    customSiteTitle: 'Finvoice API Documentation',
    customfavIcon: '/favicon.ico',
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info { margin: 50px 0; }
      .swagger-ui .info .title { color: #2c3e50; }
    `
  });
  
  // Health check endpoint
  app.use('/health', (req: any, res: any) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: configService.get('NODE_ENV') || 'development'
    });
  });
  
  const port = configService.get('API_GATEWAY_PORT') || 3000;
  await app.listen(port, '0.0.0.0');
  
  logger.log(`🚀 API Gateway running on port ${port}`);
  logger.log(`📚 API Documentation available at http://localhost:${port}/api/docs`);
  logger.log(`❤️  Health check available at http://localhost:${port}/health`);
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.log('📤 Shutting down API Gateway...');
    await app.close();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    logger.log('📤 Shutting down API Gateway...');
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  Logger.error('❌ Failed to start API Gateway:', error);
  process.exit(1);
});
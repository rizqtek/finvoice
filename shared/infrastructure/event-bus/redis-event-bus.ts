import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EventBus } from '@shared/kernel/event-bus';
import { DomainEvent } from '@shared/kernel/domain-event';

@Injectable()
export class RedisEventBus implements EventBus {
  private readonly logger = new Logger(RedisEventBus.name);
  private readonly redis: Redis;
  private readonly subscribers = new Map<string, Set<(event: DomainEvent) => void>>();

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB', 0),
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    // Setup Redis subscriber for cross-service events
    this.setupSubscriber();
  }

  async publish(event: DomainEvent): Promise<void> {
    try {
      const eventName = event.getEventName();
      const eventData = JSON.stringify({
        ...event,
        timestamp: new Date().toISOString(),
      });

      // Publish to local subscribers first
      const localSubscribers = this.subscribers.get(eventName);
      if (localSubscribers) {
        for (const subscriber of localSubscribers) {
          try {
            await subscriber(event);
          } catch (error) {
            this.logger.error(`Error in local subscriber for ${eventName}:`, error);
          }
        }
      }

      // Publish to Redis for cross-service communication
      await this.redis.publish(`finvoice:events:${eventName}`, eventData);
      
      this.logger.debug(`Published event ${eventName} to Redis`);
    } catch (error) {
      this.logger.error(`Failed to publish event ${event.getEventName()}:`, error);
      throw error;
    }
  }

  async publishMany(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  subscribe<T extends DomainEvent>(eventName: string, handler: (event: T) => Promise<void>): void {
    if (!this.subscribers.has(eventName)) {
      this.subscribers.set(eventName, new Set());
    }
    
    this.subscribers.get(eventName)!.add(handler as any);
    this.logger.debug(`Added local subscriber for ${eventName}`);
  }

  unsubscribe<T extends DomainEvent>(eventName: string, handler: (event: T) => Promise<void>): void {
    const subscribers = this.subscribers.get(eventName);
    if (subscribers) {
      subscribers.delete(handler as any);
      if (subscribers.size === 0) {
        this.subscribers.delete(eventName);
      }
    }
  }

  private setupSubscriber(): void {
    const subscriber = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB', 0),
    });

    // Subscribe to all Finvoice events
    subscriber.psubscribe('finvoice:events:*');
    
    subscriber.on('pmessage', async (pattern, channel, message) => {
      try {
        const eventName = channel.replace('finvoice:events:', '');
        const eventData = JSON.parse(message);
        
        const localSubscribers = this.subscribers.get(eventName);
        if (localSubscribers) {
          for (const subscriber of localSubscribers) {
            try {
              await subscriber(eventData);
            } catch (error) {
              this.logger.error(`Error in Redis subscriber for ${eventName}:`, error);
            }
          }
        }
        
        this.logger.debug(`Processed Redis event ${eventName}`);
      } catch (error) {
        this.logger.error('Error processing Redis event:', error);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

export interface JobData {
  [key: string]: any;
}

export interface JobHandler {
  handle(data: JobData): Promise<void>;
}

@Injectable()
export class BullMQService {
  private readonly logger = new Logger(BullMQService.name);
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly redis: Redis;

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB', 0),
    });
  }

  async addJob(queueName: string, jobName: string, data: JobData, options?: any): Promise<void> {
    let queue = this.queues.get(queueName);
    
    if (!queue) {
      queue = new Queue(queueName, {
        connection: {
          host: this.configService.get('REDIS_HOST', 'localhost'),
          port: this.configService.get('REDIS_PORT', 6379),
          password: this.configService.get('REDIS_PASSWORD'),
          db: this.configService.get('REDIS_DB', 0),
        },
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });
      
      this.queues.set(queueName, queue);
    }

    await queue.add(jobName, data, options);
    this.logger.debug(`Added job ${jobName} to queue ${queueName}`);
  }

  registerWorker(queueName: string, handlers: Map<string, JobHandler>): void {
    if (this.workers.has(queueName)) {
      this.logger.warn(`Worker for queue ${queueName} already exists`);
      return;
    }

    const worker = new Worker(
      queueName,
      async (job: Job) => {
        const handler = handlers.get(job.name);
        if (!handler) {
          throw new Error(`No handler found for job type: ${job.name}`);
        }

        this.logger.debug(`Processing job ${job.name} from queue ${queueName}`);
        await handler.handle(job.data);
        this.logger.debug(`Completed job ${job.name} from queue ${queueName}`);
      },
      {
        connection: {
          host: this.configService.get('REDIS_HOST', 'localhost'),
          port: this.configService.get('REDIS_PORT', 6379),
          password: this.configService.get('REDIS_PASSWORD'),
          db: this.configService.get('REDIS_DB', 0),
        },
        concurrency: this.configService.get('WORKER_CONCURRENCY', 5),
      }
    );

    worker.on('completed', (job) => {
      this.logger.log(`Job ${job.name} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.name} failed:`, err);
    });

    worker.on('error', (err) => {
      this.logger.error('Worker error:', err);
    });

    this.workers.set(queueName, worker);
    this.logger.log(`Registered worker for queue ${queueName}`);
  }

  async getQueueStats(queueName: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    return {
      waiting: await queue.getWaiting(),
      active: await queue.getActive(),
      completed: await queue.getCompleted(),
      failed: await queue.getFailed(),
      delayed: await queue.getDelayed(),
    };
  }

  async closeAll(): Promise<void> {
    // Close all workers
    for (const [name, worker] of this.workers) {
      await worker.close();
      this.logger.log(`Closed worker for queue ${name}`);
    }

    // Close all queues
    for (const [name, queue] of this.queues) {
      await queue.close();
      this.logger.log(`Closed queue ${name}`);
    }

    // Close Redis connection
    await this.redis.quit();
    this.logger.log('Closed Redis connection');
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeAll();
  }
}
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job, JobsOptions as BullJobOptions } from 'bullmq';
import { Redis } from 'ioredis';

export interface JobOptions {
  priority?: number;
  delay?: number;
  repeat?: any;
  attempts?: number;
  backoff?: any;
  removeOnComplete?: number;
  removeOnFail?: number;
  jobId?: string;
}

export interface JobDefinition {
  name: string;
  queue: string;
  processor: JobProcessor;
  options?: JobOptions;
  retry?: {
    attempts: number;
    backoff: 'fixed' | 'exponential';
    delay: number;
  };
  concurrency?: number;
  rateLimit?: {
    max: number;
    duration: number;
  };
  priority?: number;
  removeOnComplete?: number;
  removeOnFail?: number;
}

export interface JobProcessor {
  process(job: Job, token?: string): Promise<any>;
  onProgress?(job: Job, progress: number): Promise<void>;
  onCompleted?(job: Job, result: any): Promise<void>;
  onFailed?(job: Job, error: Error): Promise<void>;
  onStalled?(job: Job): Promise<void>;
}

export interface ScheduledJob {
  id: string;
  name: string;
  schedule: string; // cron expression or interval
  data: any;
  queue: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  maxRuns?: number;
  timezone?: string;
  metadata?: Record<string, any>;
}

export interface JobMetrics {
  queue: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  throughput: number; // jobs per minute
  averageProcessingTime: number; // milliseconds
  errorRate: number; // percentage
  lastProcessed?: Date;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  conditions?: WorkflowCondition[];
  timeout?: number;
  retryPolicy?: {
    maxAttempts: number;
    backoffStrategy: 'linear' | 'exponential' | 'fixed';
    initialDelay: number;
    maxDelay: number;
  };
  notifications?: WorkflowNotification[];
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'job' | 'condition' | 'parallel' | 'loop' | 'wait' | 'webhook';
  jobName?: string;
  data?: any;
  condition?: string;
  dependencies?: string[];
  timeout?: number;
  retryPolicy?: any;
  onSuccess?: string[];
  onFailure?: string[];
  parallel?: WorkflowStep[];
}

export interface WorkflowTrigger {
  type: 'schedule' | 'event' | 'webhook' | 'manual';
  schedule?: string;
  event?: string;
  webhookUrl?: string;
  conditions?: any[];
}

export interface WorkflowCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
  value: any;
}

export interface WorkflowNotification {
  trigger: 'start' | 'complete' | 'error' | 'step_complete' | 'step_error';
  method: 'email' | 'slack' | 'webhook' | 'sms';
  recipients: string[];
  template?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  steps: WorkflowStepExecution[];
  context: Record<string, any>;
  error?: string;
  triggeredBy: string;
}

export interface WorkflowStepExecution {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  retryCount: number;
}

@Injectable()
export class EnterpriseJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnterpriseJobService.name);
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly jobDefinitions = new Map<string, JobDefinition>();
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly scheduledJobs = new Map<string, ScheduledJob>();
  private readonly workflowExecutions = new Map<string, WorkflowExecution>();
  private redis: Redis;
  private metricsCollector: any;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB', 0),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.initializeQueues();
    await this.initializeJobProcessors();
    await this.loadScheduledJobs();
    await this.loadWorkflows();
    
    this.startMetricsCollection();
    this.logger.log('Enterprise job service initialized with advanced workflow capabilities');
  }

  async onModuleDestroy(): Promise<void> {
    // Gracefully shutdown all workers and queues
    for (const worker of this.workers.values()) {
      await worker.close();
    }
    
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    
    if (this.metricsCollector) {
      clearInterval(this.metricsCollector);
    }
    
    await this.redis.quit();
    this.logger.log('Enterprise job service shutdown completed');
  }

  /**
   * Register a job processor with advanced configuration
   */
  async registerJob(definition: JobDefinition): Promise<void> {
    this.jobDefinitions.set(definition.name, definition);

    // Create queue if it doesn't exist
    if (!this.queues.has(definition.queue)) {
      await this.createQueue(definition.queue);
    }

    // Create worker for this job type
    await this.createWorker(definition);

    this.logger.log(`Registered job processor: ${definition.name} on queue: ${definition.queue}`);
  }

  /**
   * Add job to queue with advanced options
   */
  async addJob<T = any>(
    jobName: string,
    data: T,
    options: JobOptions & {
      priority?: number;
      delay?: number;
      repeat?: any;
      attempts?: number;
      backoff?: any;
      removeOnComplete?: number;
      removeOnFail?: number;
      jobId?: string;
    } = {}
  ): Promise<Job<T>> {
    const definition = this.jobDefinitions.get(jobName);
    if (!definition) {
      throw new Error(`Job definition not found: ${jobName}`);
    }

    const queue = this.queues.get(definition.queue);
    if (!queue) {
      throw new Error(`Queue not found: ${definition.queue}`);
    }

    // Merge definition options with provided options
    const mergedOptions: any = {
      ...definition.options,
      ...options,
      attempts: options.attempts || definition.retry?.attempts,
    };

    const job = await queue.add(jobName, data, mergedOptions);
    
    this.logger.debug(`Added job: ${jobName} with ID: ${job.id}`);
    return job;
  }

  /**
   * Schedule recurring job with cron expression
   */
  async scheduleJob(
    jobName: string,
    data: any,
    schedule: string,
    options: {
      timezone?: string;
      startDate?: Date;
      endDate?: Date;
      immediate?: boolean;
      maxRuns?: number;
      jobId?: string;
    } = {}
  ): Promise<string> {
    const definition = this.jobDefinitions.get(jobName);
    if (!definition) {
      throw new Error(`Job definition not found: ${jobName}`);
    }

    const scheduledJobId = options.jobId || `scheduled_${jobName}_${Date.now()}`;
    
    const scheduledJob: ScheduledJob = {
      id: scheduledJobId,
      name: jobName,
      schedule,
      data,
      queue: definition.queue,
      enabled: true,
      runCount: 0,
      maxRuns: options.maxRuns,
      timezone: options.timezone,
      metadata: { options },
    };

    this.scheduledJobs.set(scheduledJobId, scheduledJob);

    // Add repeatable job to queue
    const queue = this.queues.get(definition.queue);
    if (queue) {
      await queue.add(
        jobName,
        data,
        {
          repeat: {
            pattern: schedule,
            tz: options.timezone,
            startDate: options.startDate,
            endDate: options.endDate,
          },
          jobId: scheduledJobId,
          removeOnComplete: definition.removeOnComplete || 100,
          removeOnFail: definition.removeOnFail || 50,
        }
      );

      // Run immediately if requested
      if (options.immediate) {
        await this.addJob(jobName, data);
      }
    }

    this.logger.log(`Scheduled recurring job: ${jobName} with schedule: ${schedule}`);
    return scheduledJobId;
  }

  /**
   * Create and execute workflow with advanced orchestration
   */
  async executeWorkflow(
    workflowId: string,
    context: Record<string, any> = {},
    triggeredBy: string = 'manual'
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const executionId = `exec_${workflowId}_${Date.now()}`;
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'pending',
      startedAt: new Date(),
      steps: workflow.steps.map(step => ({
        stepId: step.id,
        status: 'pending',
        retryCount: 0,
      })),
      context,
      triggeredBy,
    };

    this.workflowExecutions.set(executionId, execution);

    // Start workflow execution
    this.executeWorkflowSteps(execution).catch(error => {
      this.logger.error(`Workflow execution failed: ${executionId}`, error);
      execution.status = 'failed';
      execution.error = error.message;
      execution.completedAt = new Date();
    });

    this.logger.log(`Started workflow execution: ${executionId} for workflow: ${workflowId}`);
    return execution;
  }

  /**
   * Get comprehensive job metrics and analytics
   */
  async getJobMetrics(queueName?: string): Promise<JobMetrics[]> {
    const metrics: JobMetrics[] = [];

    const queuesToCheck = queueName ? [queueName] : Array.from(this.queues.keys());

    for (const queueName of queuesToCheck) {
      const queue = this.queues.get(queueName);
      if (!queue) continue;

      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
        queue.isPaused(),
      ]);

      // Calculate throughput and processing time from recent jobs
      const recentJobs = await queue.getJobs(['completed'], 0, 99);
      const throughput = this.calculateThroughput(recentJobs);
      const avgProcessingTime = this.calculateAverageProcessingTime(recentJobs);
      const errorRate = this.calculateErrorRate(completed.length, failed.length);

      metrics.push({
        queue: queueName,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: paused ? 1 : 0,
        throughput,
        averageProcessingTime: avgProcessingTime,
        errorRate,
        lastProcessed: recentJobs[0]?.finishedOn ? new Date(recentJobs[0].finishedOn) : undefined,
      });
    }

    return metrics;
  }

  /**
   * Advanced job monitoring and health checks
   */
  async getJobHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    queues: Array<{
      name: string;
      status: 'healthy' | 'degraded' | 'unhealthy';
      issues: string[];
    }>;
    workers: Array<{
      name: string;
      status: 'running' | 'stopped' | 'error';
      lastActivity?: Date;
    }>;
    redis: {
      status: 'connected' | 'disconnected' | 'error';
      latency?: number;
    };
  }> {
    const queueStatuses = [];
    const workerStatuses = [];

    // Check queue health
    for (const [queueName, queue] of this.queues) {
      const issues: string[] = [];
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      try {
        const [active, failed, waiting] = await Promise.all([
          queue.getActive(),
          queue.getFailed(),
          queue.getWaiting(),
        ]);

        // Check for too many failed jobs
        if (failed.length > 100) {
          issues.push('High number of failed jobs');
          status = 'degraded';
        }

        // Check for jobs stuck in active state
        const stuckJobs = active.filter(job => 
          job.processedOn && (Date.now() - job.processedOn) > 300000 // 5 minutes
        );
        
        if (stuckJobs.length > 0) {
          issues.push('Jobs stuck in active state');
          status = 'unhealthy';
        }

        // Check for excessive queue backlog
        if (waiting.length > 1000) {
          issues.push('Large queue backlog');
          status = 'degraded';
        }

      } catch (error) {
        issues.push(`Queue error: ${(error as Error).message}`);
        status = 'unhealthy';
      }

      queueStatuses.push({ name: queueName, status, issues });
    }

    // Check worker health
    for (const [workerName, worker] of this.workers) {
      const status: 'running' | 'stopped' | 'error' = worker.isRunning() ? 'running' : 'stopped';
      workerStatuses.push({ name: workerName, status });
    }

    // Check Redis health
    let redisStatus: 'connected' | 'disconnected' | 'error' = 'connected';
    let redisLatency: number | undefined;

    try {
      const start = Date.now();
      await this.redis.ping();
      redisLatency = Date.now() - start;
      
      if (redisLatency > 100) {
        redisStatus = 'degraded' as any; // High latency
      }
    } catch (error) {
      redisStatus = 'error';
    }

    // Determine overall status
    const hasUnhealthyQueues = queueStatuses.some(q => q.status === 'unhealthy');
    const hasStoppedWorkers = workerStatuses.some(w => w.status === 'stopped');
    const isRedisDown = redisStatus === 'error';

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (hasUnhealthyQueues || hasStoppedWorkers || isRedisDown) {
      overallStatus = 'unhealthy';
    } else if (queueStatuses.some(q => q.status === 'degraded') || redisLatency && redisLatency > 50) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      queues: queueStatuses,
      workers: workerStatuses,
      redis: {
        status: redisStatus,
        latency: redisLatency,
      },
    };
  }

  /**
   * Bulk job operations for enterprise management
   */
  async bulkJobOperations(operations: Array<{
    operation: 'retry' | 'cancel' | 'promote' | 'clean';
    queueName: string;
    jobIds?: string[];
    filter?: {
      status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
      olderThan?: Date;
    };
  }>): Promise<{
    processed: number;
    errors: Array<{ operation: any; error: string }>;
  }> {
    let processed = 0;
    const errors: Array<{ operation: any; error: string }> = [];

    for (const operation of operations) {
      try {
        const queue = this.queues.get(operation.queueName);
        if (!queue) {
          errors.push({ operation, error: `Queue not found: ${operation.queueName}` });
          continue;
        }

        let targetJobs: Job[] = [];

        if (operation.jobIds) {
          // Operate on specific job IDs
          targetJobs = await Promise.all(
            operation.jobIds.map(id => queue.getJob(id)).filter(Boolean) as Promise<Job>[]
          );
        } else if (operation.filter) {
          // Operate on jobs matching filter
          targetJobs = await this.getJobsByFilter(queue, operation.filter);
        }

        for (const job of targetJobs) {
          switch (operation.operation) {
            case 'retry':
              await job.retry();
              break;
            case 'cancel':
              await job.remove();
              break;
            case 'promote':
              await job.promote();
              break;
            case 'clean':
              await job.remove();
              break;
          }
          processed++;
        }

      } catch (error) {
        errors.push({ operation, error: (error as Error).message });
      }
    }

    return { processed, errors };
  }

  // Private implementation methods

  private async initializeQueues(): Promise<void> {
    const queueNames = this.configService.get('JOB_QUEUES', 'default,billing,notifications,reports').split(',');
    
    for (const queueName of queueNames) {
      await this.createQueue(queueName.trim());
    }
  }

  private async createQueue(queueName: string): Promise<Queue> {
    const queue = new Queue(queueName, {
      connection: {
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        password: this.configService.get('REDIS_PASSWORD'),
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.queues.set(queueName, queue);
    return queue;
  }

  private async createWorker(definition: JobDefinition): Promise<Worker> {
    const worker = new Worker(
      definition.queue,
      async (job: Job) => {
        try {
          this.logger.debug(`Processing job: ${job.name} (${job.id})`);
          const result = await definition.processor.process(job);
          
          if (definition.processor.onCompleted) {
            await definition.processor.onCompleted(job, result);
          }
          
          return result;
        } catch (error) {
          this.logger.error(`Job failed: ${job.name} (${job.id})`, error);
          
          if (definition.processor.onFailed) {
            await definition.processor.onFailed(job, error as Error);
          }
          
          throw error;
        }
      },
      {
        connection: {
          host: this.configService.get('REDIS_HOST', 'localhost'),
          port: this.configService.get('REDIS_PORT', 6379),
          password: this.configService.get('REDIS_PASSWORD'),
        },
        concurrency: definition.concurrency || 1,
        limiter: definition.rateLimit ? {
          max: definition.rateLimit.max,
          duration: definition.rateLimit.duration,
        } : undefined,
      }
    );

    // Set up event listeners
    worker.on('progress', async (job, progress) => {
      if (definition.processor.onProgress && typeof progress === 'number') {
        await definition.processor.onProgress(job, progress);
      }
    });

    worker.on('stalled', async (jobId) => {
      const job = await this.queues.get(definition.queue)?.getJob(jobId);
      if (job && definition.processor.onStalled) {
        await definition.processor.onStalled(job);
      }
    });

    this.workers.set(`${definition.queue}_${definition.name}`, worker);
    return worker;
  }

  private async initializeJobProcessors(): Promise<void> {
    // Register built-in job processors
    
    // Invoice generation job
    await this.registerJob({
      name: 'generate-invoice',
      queue: 'billing',
      processor: {
        process: async (job: Job) => {
          const { invoiceId } = job.data;
          // Implementation would generate invoice
          await job.updateProgress(50);
          // Generate PDF, send email, etc.
          await job.updateProgress(100);
          return { invoiceId, status: 'generated' };
        },
      },
      retry: { attempts: 3, backoff: 'exponential', delay: 5000 },
      removeOnComplete: 50,
      removeOnFail: 25,
    });

    // Payment reminder job
    await this.registerJob({
      name: 'send-payment-reminder',
      queue: 'notifications',
      processor: {
        process: async (job: Job) => {
          const { invoiceId, reminderType } = job.data;
          // Implementation would send payment reminder
          return { invoiceId, reminderType, sent: true };
        },
      },
      retry: { attempts: 2, backoff: 'fixed', delay: 30000 },
      concurrency: 5,
    });

    // Financial report generation
    await this.registerJob({
      name: 'generate-financial-report',
      queue: 'reports',
      processor: {
        process: async (job: Job) => {
          const { reportType, parameters } = job.data;
          // Implementation would generate financial report
          await job.updateProgress(25);
          // Fetch data
          await job.updateProgress(50);
          // Process data
          await job.updateProgress(75);
          // Generate report
          await job.updateProgress(100);
          return { reportId: `report_${Date.now()}`, type: reportType };
        },
      },
      retry: { attempts: 2, backoff: 'exponential', delay: 10000 },
      removeOnComplete: 25,
    });

    // Data backup job
    await this.registerJob({
      name: 'backup-data',
      queue: 'default',
      processor: {
        process: async (job: Job) => {
          const { backupType, entities } = job.data;
          // Implementation would backup data
          return { backupId: `backup_${Date.now()}`, type: backupType };
        },
      },
      retry: { attempts: 1, backoff: 'fixed', delay: 60000 },
      removeOnComplete: 10,
    });
  }

  private async loadScheduledJobs(): Promise<void> {
    // Load scheduled jobs from configuration or database
    const schedules = [
      {
        name: 'daily-report-generation',
        jobName: 'generate-financial-report',
        schedule: '0 6 * * *', // 6 AM daily
        data: { reportType: 'daily', automated: true },
      },
      {
        name: 'weekly-backup',
        jobName: 'backup-data',
        schedule: '0 2 * * 0', // 2 AM every Sunday
        data: { backupType: 'weekly', entities: ['invoices', 'payments', 'customers'] },
      },
      {
        name: 'payment-reminders',
        jobName: 'send-payment-reminder',
        schedule: '0 9 * * *', // 9 AM daily
        data: { reminderType: 'overdue' },
      },
    ];

    for (const schedule of schedules) {
      await this.scheduleJob(schedule.jobName, schedule.data, schedule.schedule, {
        jobId: schedule.name,
      });
    }
  }

  private async loadWorkflows(): Promise<void> {
    // Load workflow definitions
    const workflows: WorkflowDefinition[] = [
      {
        id: 'invoice-to-payment-workflow',
        name: 'Invoice to Payment Complete Workflow',
        description: 'Complete workflow from invoice generation to payment completion',
        steps: [
          {
            id: 'generate-invoice',
            name: 'Generate Invoice',
            type: 'job',
            jobName: 'generate-invoice',
            onSuccess: ['send-invoice-notification'],
            onFailure: ['notify-admin'],
          },
          {
            id: 'send-invoice-notification',
            name: 'Send Invoice Notification',
            type: 'job',
            jobName: 'send-notification',
            dependencies: ['generate-invoice'],
            onSuccess: ['schedule-payment-reminder'],
          },
          {
            id: 'schedule-payment-reminder',
            name: 'Schedule Payment Reminder',
            type: 'job',
            jobName: 'schedule-reminder',
            dependencies: ['send-invoice-notification'],
            data: { delay: '7 days' },
          },
        ],
        triggers: [
          {
            type: 'event',
            event: 'invoice.created',
          },
        ],
        timeout: 3600000, // 1 hour
        notifications: [
          {
            trigger: 'complete',
            method: 'email',
            recipients: ['finance@company.com'],
          },
        ],
      },
    ];

    for (const workflow of workflows) {
      this.workflows.set(workflow.id, workflow);
    }
  }

  private async executeWorkflowSteps(execution: WorkflowExecution): Promise<void> {
    const workflow = this.workflows.get(execution.workflowId)!;
    execution.status = 'running';

    try {
      for (const step of workflow.steps) {
        const stepExecution = execution.steps.find(s => s.stepId === step.id)!;
        
        // Check dependencies
        if (step.dependencies) {
          const dependenciesMet = step.dependencies.every(depId => {
            const depStep = execution.steps.find(s => s.stepId === depId);
            return depStep?.status === 'completed';
          });
          
          if (!dependenciesMet) {
            stepExecution.status = 'skipped';
            continue;
          }
        }

        stepExecution.status = 'running';
        stepExecution.startedAt = new Date();

        try {
          let result: any;

          switch (step.type) {
            case 'job':
              if (step.jobName) {
                const job = await this.addJob(step.jobName, {
                  ...step.data,
                  ...execution.context,
                });
                // For demonstration, we'll consider the job completed immediately
                result = { jobId: job.id, status: 'completed' };
              }
              break;

            case 'condition':
              result = this.evaluateCondition(step.condition!, execution.context);
              break;

            case 'wait':
              await this.delay(step.timeout || 1000);
              result = { waited: step.timeout };
              break;

            case 'webhook':
              // Implementation would call webhook
              result = { webhook: 'called' };
              break;
          }

          stepExecution.status = 'completed';
          stepExecution.completedAt = new Date();
          stepExecution.result = result;

          // Execute success actions
          if (step.onSuccess) {
            // Implementation would handle success actions
          }

        } catch (error) {
          stepExecution.status = 'failed';
          stepExecution.error = (error as Error).message;
          stepExecution.completedAt = new Date();

          // Execute failure actions
          if (step.onFailure) {
            // Implementation would handle failure actions
          }

          // Check if workflow should continue or fail
          if (!step.onFailure) {
            throw error;
          }
        }
      }

      execution.status = 'completed';
      execution.completedAt = new Date();

    } catch (error) {
      execution.status = 'failed';
      execution.error = (error as Error).message;
      execution.completedAt = new Date();
    }
  }

  private startMetricsCollection(): void {
    this.metricsCollector = setInterval(async () => {
      try {
        const metrics = await this.getJobMetrics();
        // Store metrics for analytics
        await this.storeMetrics(metrics);
      } catch (error) {
        this.logger.error('Failed to collect job metrics', error);
      }
    }, 60000); // Collect every minute
  }

  private calculateThroughput(jobs: Job[]): number {
    if (jobs.length === 0) return 0;
    
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const recentJobs = jobs.filter(job => job.finishedOn && job.finishedOn > oneHourAgo);
    
    return (recentJobs.length / 60); // jobs per minute
  }

  private calculateAverageProcessingTime(jobs: Job[]): number {
    if (jobs.length === 0) return 0;
    
    const processingTimes = jobs
      .filter(job => job.processedOn && job.finishedOn)
      .map(job => job.finishedOn! - job.processedOn!);
    
    return processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
  }

  private calculateErrorRate(completed: number, failed: number): number {
    const total = completed + failed;
    return total > 0 ? (failed / total) * 100 : 0;
  }

  private async getJobsByFilter(queue: Queue, filter: any): Promise<Job[]> {
    let jobs: Job[] = [];
    
    switch (filter.status) {
      case 'waiting':
        jobs = await queue.getWaiting();
        break;
      case 'active':
        jobs = await queue.getActive();
        break;
      case 'completed':
        jobs = await queue.getCompleted();
        break;
      case 'failed':
        jobs = await queue.getFailed();
        break;
      case 'delayed':
        jobs = await queue.getDelayed();
        break;
    }

    if (filter.olderThan) {
      jobs = jobs.filter(job => 
        job.timestamp < filter.olderThan.getTime()
      );
    }

    return jobs;
  }

  private evaluateCondition(condition: string, context: Record<string, any>): boolean {
    // Simple condition evaluation - in production, use a proper expression engine
    try {
      const func = new Function('context', `return ${condition}`);
      return func(context);
    } catch {
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async storeMetrics(metrics: JobMetrics[]): Promise<void> {
    // Implementation would store metrics to database or monitoring system
    this.logger.debug(`Collected metrics for ${metrics.length} queues`);
  }
}
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransporter } from './email-transport.factory';
import { EmailTemplateService } from './email-template.service';
import { EmailDeliveryTracker } from './email-delivery-tracker';
import { EmailQueue } from './email-queue.service';

export interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  template?: string;
  templateData?: Record<string, any>;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  priority?: 'high' | 'normal' | 'low';
  deliveryTime?: Date;
  trackOpens?: boolean;
  trackClicks?: boolean;
  retryAttempts?: number;
  metadata?: Record<string, any>;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  cid?: string; // Content-ID for inline attachments
  encoding?: string;
}

export interface EmailDeliveryStatus {
  messageId: string;
  status: 'pending' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed';
  timestamps: {
    queued?: Date;
    sent?: Date;
    delivered?: Date;
    opened?: Date;
    clicked?: Date;
    bounced?: Date;
    complained?: Date;
  };
  attempts: number;
  lastError?: string;
  recipientEvents: EmailRecipientEvent[];
}

export interface EmailRecipientEvent {
  recipient: string;
  event: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained';
  timestamp: Date;
  metadata?: Record<string, any>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: any;

  constructor(
    private readonly configService: ConfigService,
    private readonly templateService: EmailTemplateService,
    private readonly deliveryTracker: EmailDeliveryTracker,
    private readonly emailQueue: EmailQueue,
  ) {
    // Initialize transporter with proper config
    const transportConfig = {
      provider: 'nodemailer' as const,
      host: this.configService.get('SMTP_HOST'),
      port: this.configService.get('SMTP_PORT'),
      secure: this.configService.get('SMTP_SECURE'),
      auth: {
        user: this.configService.get('SMTP_USER', ''),
        pass: this.configService.get('SMTP_PASS', ''),
      }
    };
    this.transporter = createTransporter(transportConfig);
  }

  /**
   * Send email immediately with full tracking and retry logic
   */
  async sendEmail(options: EmailOptions): Promise<EmailDeliveryStatus> {
    const messageId = this.generateMessageId();
    
    try {
      // Initialize delivery tracking
      const deliveryStatus = await this.deliveryTracker.trackDelivery(messageId, {
        messageId,
        status: 'sent',
        timestamp: new Date(),
        recipient: options.to[0],
      });

      // Process template if specified
      let html = options.html;
      let text = options.text;
      let subject = options.subject;

      if (options.template && options.templateData) {
        // Render template if provided
        const rendered = await this.templateService.renderTemplate(
          options.template, 
          options.templateData
        );
        html = rendered.html;
        text = rendered.text;
        subject = rendered.subject || subject;
      }

      // Prepare email payload
      const emailPayload = {
        messageId,
        from: this.configService.get('EMAIL_FROM_ADDRESS'),
        to: Array.isArray(options.to) ? options.to : [options.to],
        cc: options.cc,
        bcc: options.bcc,
        subject,
        html,
        text,
        attachments: await this.processAttachments(options.attachments || []),
        headers: {
          'X-Message-ID': messageId,
          'X-Priority': this.getPriorityHeader(options.priority),
          'X-Finvoice-Type': options.metadata?.type || 'general',
        },
      };

      // Send email
      const result = await this.transporter.sendMail(emailPayload);
      
      await this.deliveryTracker.trackDelivery(messageId, {
        messageId,
        status: 'sent',
        timestamp: new Date(),
        recipient: options.to[0],
        metadata: {
          transportMessageId: result.messageId,
          acceptedRecipients: result.accepted,
          rejectedRecipients: result.rejected,
        },
      });

      this.logger.log(`Email sent successfully: ${messageId} to ${options.to}`);
      
      const status = await this.deliveryTracker.getDeliveryStatus(messageId);
      return {
        messageId,
        status: status?.status || 'sent',
        timestamps: { sent: new Date() },
        recipient: Array.isArray(options.to) ? options.to[0] : options.to,
        metadata: {},
        attempts: 1,
        recipientEvents: []
      } as EmailDeliveryStatus;

    } catch (error) {
      this.logger.error(`Failed to send email ${messageId}:`, error);
      
      await this.deliveryTracker.trackDelivery(messageId, {
        messageId,
        status: 'failed',
        timestamp: new Date(),
        recipient: options.to[0],
        metadata: {
          error: (error as Error).message,
          stack: (error as Error).stack,
        },
      });

      // Queue for retry if configured
      if ((options.retryAttempts ?? 3) > 0) {
        await this.emailQueue.addToQueue({
          to: Array.isArray(options.to) ? options.to : [options.to],
          subject: options.subject,
          html: options.html || '',
          text: options.text,
          priority: options.priority || 'normal',
          maxRetries: 3,
        });
      }

      throw error;
    }
  }

  /**
   * Queue email for delayed delivery with advanced scheduling
   */
  async queueEmail(options: EmailOptions): Promise<string> {
    const messageId = this.generateMessageId();
    
    const jobOptions = {
      delay: options.deliveryTime ? options.deliveryTime.getTime() - Date.now() : 0,
      attempts: options.retryAttempts ?? 3,
      backoff: {
        type: 'exponential' as const,
        delay: 60000, // Start with 1 minute delay
      },
      removeOnComplete: 50,
      removeOnFail: 100,
    };

    await this.emailQueue.addToQueue({
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html || '',
      text: options.text,
      priority: options.priority || 'normal',
      scheduledAt: undefined,
      maxRetries: 3,
    });

    await this.deliveryTracker.trackDelivery(messageId, {
      messageId,
      status: 'pending',
      timestamp: new Date(),
      recipient: options.to[0],
    });
    
    this.logger.log(`Email queued: ${messageId} for ${options.to}`);
    return messageId;
  }

  /**
   * Send bulk emails with rate limiting and parallel processing
   */
  async sendBulkEmails(emails: EmailOptions[], options?: {
    batchSize?: number;
    rateLimit?: number; // emails per minute
    failureThreshold?: number; // percentage of failures to stop
  }): Promise<EmailDeliveryStatus[]> {
    const batchSize = options?.batchSize ?? 50;
    const rateLimit = options?.rateLimit ?? 100;
    const failureThreshold = options?.failureThreshold ?? 20;

    const results: EmailDeliveryStatus[] = [];
    const batches = this.chunkArray(emails, batchSize);
    let failureCount = 0;

    for (const batch of batches) {
      const batchPromises = batch.map(async (email) => {
        try {
          const result = await this.sendEmail(email);
          if (result.status === 'failed') {
            failureCount++;
          }
          return result;
        } catch (error) {
          failureCount++;
          this.logger.error(`Bulk email failed for ${email.to}:`, error);
          throw error;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Check failure threshold
      const failurePercentage = (failureCount / results.length) * 100;
      if (failurePercentage > failureThreshold) {
        this.logger.error(`Bulk email stopped due to high failure rate: ${failurePercentage}%`);
        throw new Error(`Bulk email failure threshold exceeded: ${failurePercentage}%`);
      }

      // Rate limiting between batches
      if (rateLimit > 0) {
        const delayMs = (60000 / rateLimit) * batchSize;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // Process results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }
    }

    return results;
  }

  /**
   * Get delivery status with comprehensive tracking
   */
  async getDeliveryStatus(messageId: string): Promise<EmailDeliveryStatus> {
    const status = await this.deliveryTracker.getDeliveryStatus(messageId);
    return {
      messageId,
      status: status?.status || 'failed',
      timestamps: {},
      recipient: '',
      metadata: {},
      attempts: 1,
      recipientEvents: []
    } as EmailDeliveryStatus;
  }

  /**
   * Handle webhook events from email providers (SES, SendGrid, etc.)
   */
  async handleWebhookEvent(provider: string, payload: any): Promise<void> {
    try {
      const events = this.parseWebhookPayload(provider, payload);
      
      for (const event of events) {
        await this.deliveryTracker.trackDelivery(
          event.messageId,
          {
            messageId: event.messageId,
            status: event.type as any,
            timestamp: event.timestamp,
            recipient: event.recipient,
            metadata: event.metadata,
          }
        );
      }
      
      this.logger.log(`Processed ${events.length} webhook events from ${provider}`);
    } catch (error) {
      this.logger.error(`Failed to process webhook from ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Generate analytics report for email campaigns
   */
  async getEmailAnalytics(options: {
    startDate: Date;
    endDate: Date;
    template?: string;
    campaign?: string;
  }): Promise<{
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
    complaintRate: number;
    topLinks: Array<{ url: string; clicks: number }>;
    deviceBreakdown: Record<string, number>;
    geographicBreakdown: Record<string, number>;
  }> {
    return this.deliveryTracker.getDeliveryStats({
      start: options.startDate,
      end: options.endDate
    });
  }

  private generateMessageId(): string {
    return `fin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getPriorityHeader(priority?: string): string {
    switch (priority) {
      case 'high': return '1 (Highest)';
      case 'low': return '5 (Lowest)';
      default: return '3 (Normal)';
    }
  }

  private async processAttachments(attachments: EmailAttachment[]): Promise<any[]> {
    return attachments.map(attachment => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
      cid: attachment.cid,
      encoding: attachment.encoding || 'base64',
    }));
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private parseWebhookPayload(provider: string, payload: any): Array<{
    messageId: string;
    type: string;
    recipient: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }> {
    // Implementation varies by provider (SES, SendGrid, Mailgun, etc.)
    switch (provider.toLowerCase()) {
      case 'ses':
        return this.parseSESWebhook(payload);
      case 'sendgrid':
        return this.parseSendGridWebhook(payload);
      case 'mailgun':
        return this.parseMailgunWebhook(payload);
      default:
        throw new Error(`Unsupported email provider: ${provider}`);
    }
  }

  private parseSESWebhook(payload: any): any[] {
    // AWS SES webhook parsing logic
    const events = [];
    if (payload.Records) {
      for (const record of payload.Records) {
        if (record.ses) {
          events.push({
            messageId: record.ses.mail.commonHeaders['X-Message-ID'],
            type: record.eventType,
            recipient: record.ses.mail.destination[0],
            timestamp: new Date(record.ses.mail.timestamp),
            metadata: record.ses,
          });
        }
      }
    }
    return events;
  }

  private parseSendGridWebhook(payload: any): any[] {
    // SendGrid webhook parsing logic
    if (Array.isArray(payload)) {
      return payload.map(event => ({
        messageId: event['finvoice-message-id'] || event.sg_message_id,
        type: event.event,
        recipient: event.email,
        timestamp: new Date(event.timestamp * 1000),
        metadata: event,
      }));
    }
    return [];
  }

  private parseMailgunWebhook(payload: any): any[] {
    // Mailgun webhook parsing logic
    if (payload['event-data']) {
      const eventData = payload['event-data'];
      return [{
        messageId: eventData.message.headers['X-Message-ID'],
        type: eventData.event,
        recipient: eventData.recipient,
        timestamp: new Date(eventData.timestamp * 1000),
        metadata: eventData,
      }];
    }
    return [];
  }
}
import { Injectable } from '@nestjs/common';

export interface EmailTransportConfig {
  provider: 'nodemailer' | 'sendgrid' | 'ses';
  apiKey?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
}

@Injectable()
export class EmailTransportFactory {
  // Placeholder implementation
}

export function createTransporter(config: EmailTransportConfig): any {
  // Placeholder implementation
  return {
    sendMail: async (options: any) => {
      console.log('Mock email sent:', options.to);
      return { messageId: 'mock-message-id' };
    }
  };
}
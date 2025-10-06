import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserProfileDocument = UserProfile & Document;

@Schema({ timestamps: true })
export class UserProfile {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop()
  avatar: string;

  @Prop()
  phone: string;

  @Prop()
  dateOfBirth: Date;

  @Prop()
  gender: string;

  @Prop()
  timezone: string;

  @Prop()
  language: string;

  @Prop()
  currency: string;

  @Prop({ type: Object })
  address: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };

  @Prop({ type: Object })
  company: {
    name?: string;
    position?: string;
    department?: string;
    website?: string;
  };

  @Prop({ type: Object })
  socialLinks: {
    linkedin?: string;
    twitter?: string;
    github?: string;
    website?: string;
  };

  @Prop({ type: Object })
  preferences: {
    emailNotifications?: boolean;
    smsNotifications?: boolean;
    pushNotifications?: boolean;
    marketingEmails?: boolean;
    theme?: string;
    dateFormat?: string;
    timeFormat?: string;
  };

  @Prop({ type: Object })
  security: {
    lastPasswordChange?: Date;
    failedLoginAttempts?: number;
    accountLockedUntil?: Date;
    securityQuestions?: Array<{
      question: string;
      answer: string;
    }>;
  };

  @Prop({ type: Object })
  analytics: {
    totalLogins?: number;
    lastActiveAt?: Date;
    averageSessionDuration?: number;
    preferredFeatures?: string[];
  };

  @Prop({ type: Object })
  metadata: Record<string, any>;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const UserProfileSchema = SchemaFactory.createForClass(UserProfile);
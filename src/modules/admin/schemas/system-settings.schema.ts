import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ExtendedSystemSettings } from '../interfaces/populated-types';

export type SystemSettingsDocument = SystemSettings & Document & ExtendedSystemSettings;

@Schema({ timestamps: true })
export class SystemSettings {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true, type: Object })
  value: any;

  @Prop({ required: false })
  description?: string;

  @Prop({ default: 'string' })
  type: string;

  @Prop({ default: false })
  isSecret: boolean;

  @Prop({ default: true })
  isEditable: boolean;

  @Prop({ required: false })
  category?: string;

  @Prop({ required: false })
  validationRules?: string;

  // Extended properties for system configuration
  @Prop({ type: Object, required: false })
  maintenance?: {
    enabled: boolean;
    message?: string;
    scheduledAt?: Date;
  };

  @Prop({ type: Object, required: false })
  auditRetentionPolicy?: {
    days: number;
    autoCleanup: boolean;
    compressionEnabled: boolean;
  };

  @Prop({ type: Object, required: false })
  auditAlerts?: {
    failedLogins: boolean;
    permissionChanges: boolean;
    systemAccess: boolean;
    thresholds: Record<string, number>;
  };

  @Prop({ type: Object, required: false })
  configurations?: Record<string, any>;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any>;

  @Prop({ default: Date.now })
  createdAt?: Date;

  @Prop({ default: Date.now })
  updatedAt?: Date;
}

export const SystemSettingsSchema = SchemaFactory.createForClass(SystemSettings);
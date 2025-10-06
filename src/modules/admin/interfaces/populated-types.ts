import { RoleDocument } from '../schemas/role.schema';
import { PermissionDocument } from '../schemas/permission.schema';
import { UserDocument } from '../schemas/user.schema';

// Populated type definitions for better TypeScript support
export interface PopulatedRole extends Omit<RoleDocument, 'permissions'> {
  permissions: PermissionDocument[];
}

export interface PopulatedPermission extends PermissionDocument {
  // Additional properties if needed
}

export interface PopulatedUser extends Omit<UserDocument, 'roles'> {
  roles: RoleDocument[];
}

// Extended system settings interface
export interface ExtendedSystemSettings {
  maintenance?: {
    enabled: boolean;
    message?: string;
    scheduledAt?: Date;
  };
  auditRetentionPolicy?: {
    days: number;
    autoCleanup: boolean;
    compressionEnabled: boolean;
  };
  auditAlerts?: {
    failedLogins: boolean;
    permissionChanges: boolean;
    systemAccess: boolean;
    thresholds: Record<string, number>;
  };
  configurations?: Record<string, any>;
}

// Helper types for API responses
export interface UserWithRoles {
  _id: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  roles?: any[];
}

export interface RoleWithLevel {
  _id: string;
  name: string;
  displayName: string;
  level?: number;
  status?: string;
  isSystemRole?: boolean;
  permissions?: any[];
}

export interface PermissionWithCategory {
  _id: string;
  name: string;
  displayName: string;
  category?: string;
  scope?: string;
  resource: string;
  action: string;
}
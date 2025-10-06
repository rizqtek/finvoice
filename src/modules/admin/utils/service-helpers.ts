// Utility functions for admin services
import { SortOrder } from 'mongoose';

export function createSortObject(sort: Record<string, any>): Record<string, SortOrder> {
  const sortObj: Record<string, SortOrder> = {};
  
  for (const [key, value] of Object.entries(sort)) {
    if (typeof value === 'number') {
      sortObj[key] = value > 0 ? 1 : -1;
    } else if (typeof value === 'string') {
      sortObj[key] = value.toLowerCase() === 'desc' ? -1 : 1;
    } else {
      sortObj[key] = value;
    }
  }
  
  return sortObj;
}

export function extractUserInfo(user: any): { username?: string; email?: string } {
  if (typeof user === 'string') {
    return { username: user, email: '' };
  }
  
  if (user && typeof user === 'object') {
    return {
      username: user.username || user.name || user._id?.toString() || 'Unknown',
      email: user.email || ''
    };
  }
  
  return { username: 'System', email: '' };
}

export function extractPermissionId(permission: any): string {
  if (typeof permission === 'string') {
    return permission;
  }
  
  if (permission && typeof permission === 'object') {
    return permission._id?.toString() || permission.id?.toString() || permission.name || '';
  }
  
  return '';
}

export function hasProperty<T extends object, K extends string>(
  obj: T,
  prop: K
): obj is T & Record<K, any> {
  return prop in obj;
}
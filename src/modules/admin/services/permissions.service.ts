import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Permission, PermissionDocument } from '../schemas/permission.schema';
import { Role, RoleDocument } from '../schemas/role.schema';
import { AuditLog, AuditLogDocument } from '../schemas/audit-log.schema';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(
    @InjectModel(Permission.name) private permissionModel: Model<PermissionDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
  ) {}

  async getPermissions(filters: any = {}, pagination: any = {}, sorting: any = {}) {
    try {
      const { search, resource, category } = filters;
      const { page = 1, limit = 10 } = pagination;
      const { sortBy = 'createdAt', sortOrder = 'desc' } = sorting;

      const query: any = {};

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { resource: { $regex: search, $options: 'i' } },
          { action: { $regex: search, $options: 'i' } }
        ];
      }

      if (resource) {
        query.resource = resource;
      }

      if (category) {
        query.category = category;
      }

      const skip = (page - 1) * limit;
      const sortObj = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      const sortObject = Object.keys(sortObj).reduce((acc, key) => {
        (acc as any)[key] = (sortObj as any)[key] > 0 ? 1 : -1;
        return acc;
      }, {} as Record<string, 1 | -1>);

      const [permissions, total] = await Promise.all([
        this.permissionModel
          .find(query)
          .sort(sortObject)
          .skip(skip)
          .limit(limit)
          .exec(),
        this.permissionModel.countDocuments(query).exec()
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        permissions,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      this.logger.error('Failed to get permissions', error);
      throw error;
    }
  }

  async getGroupedPermissions() {
    try {
      const permissions = await this.permissionModel
        .find()
        .sort({ category: 1, resource: 1, action: 1 })
        .exec();

      const grouped = permissions.reduce((acc: Record<string, Record<string, any[]>>, permission) => {
        const category = permission.category || 'General';
        if (!acc[category]) {
          acc[category] = {};
        }

        const resource = permission.resource;
        if (!acc[category][resource]) {
          acc[category][resource] = [];
        }

        acc[category][resource].push(permission);
        return acc;
      }, {});

      return grouped;
    } catch (error) {
      this.logger.error('Failed to get grouped permissions', error);
      throw error;
    }
  }

  async getPermissionResources() {
    try {
      const resources = await this.permissionModel.distinct('resource').exec();
      return resources.sort();
    } catch (error) {
      this.logger.error('Failed to get permission resources', error);
      throw error;
    }
  }

  async getPermissionCategories() {
    try {
      const categories = await this.permissionModel.distinct('category').exec();
      return categories.filter(cat => cat).sort();
    } catch (error) {
      this.logger.error('Failed to get permission categories', error);
      throw error;
    }
  }

  async getPermissionById(id: string) {
    try {
      const permission = await this.permissionModel.findById(id).exec();
      
      if (!permission) {
        throw new NotFoundException('Permission not found');
      }

      return permission;
    } catch (error) {
      this.logger.error(`Failed to get permission ${id}`, error);
      throw error;
    }
  }

  async getPermissionRoles(id: string, pagination: any = {}) {
    try {
      const { page = 1, limit = 10 } = pagination;
      const skip = (page - 1) * limit;

      const permission = await this.permissionModel.findById(id).exec();
      if (!permission) {
        throw new NotFoundException('Permission not found');
      }

      const [roles, total] = await Promise.all([
        this.roleModel
          .find({ permissions: id })
          .select('name description status level')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.roleModel.countDocuments({ permissions: id }).exec()
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        permission: { id: permission._id, name: permission.name },
        roles,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get roles for permission ${id}`, error);
      throw error;
    }
  }

  async createPermission(permissionData: any) {
    try {
      // Check if permission already exists
      const existingPermission = await this.permissionModel
        .findOne({ resource: permissionData.resource, action: permissionData.action })
        .exec();

      if (existingPermission) {
        throw new ConflictException('Permission for this resource and action already exists');
      }

      const permission = new this.permissionModel(permissionData);
      const savedPermission = await permission.save();

      await this.logAction('permission_created', savedPermission._id.toString(), 'admin', permissionData);

      this.logger.log(`Permission created: ${savedPermission.name}`);
      return savedPermission;
    } catch (error) {
      this.logger.error('Failed to create permission', error);
      throw error;
    }
  }

  async updatePermission(id: string, updateData: any) {
    try {
      const permission = await this.permissionModel.findById(id).exec();
      if (!permission) {
        throw new NotFoundException('Permission not found');
      }

      // Check for conflicts if resource or action is being updated
      if (updateData.resource || updateData.action) {
        const resource = updateData.resource || permission.resource;
        const action = updateData.action || permission.action;
        
        const existingPermission = await this.permissionModel
          .findOne({ 
            resource, 
            action,
            _id: { $ne: id }
          })
          .exec();

        if (existingPermission) {
          throw new ConflictException('Permission for this resource and action already exists');
        }
      }

      const updatedPermission = await this.permissionModel
        .findByIdAndUpdate(id, { ...updateData, updatedAt: new Date() }, { new: true })
        .exec();

      await this.logAction('permission_updated', id, 'admin', updateData);

      this.logger.log(`Permission updated: ${updatedPermission?.name || 'Unknown'}`);
      return updatedPermission;
    } catch (error) {
      this.logger.error(`Failed to update permission ${id}`, error);
      throw error;
    }
  }

  async deletePermission(id: string) {
    try {
      const permission = await this.permissionModel.findById(id).exec();
      if (!permission) {
        throw new NotFoundException('Permission not found');
      }

      // Check if permission is assigned to roles
      const rolesWithPermission = await this.roleModel.countDocuments({ permissions: id }).exec();
      if (rolesWithPermission > 0) {
        throw new ConflictException('Cannot delete permission that is assigned to roles');
      }

      await this.permissionModel.findByIdAndDelete(id).exec();

      await this.logAction('permission_deleted', id, 'admin', { permissionName: permission.name });

      this.logger.log(`Permission deleted: ${permission.name}`);
      return { success: true, message: 'Permission deleted successfully' };
    } catch (error) {
      this.logger.error(`Failed to delete permission ${id}`, error);
      throw error;
    }
  }

  async bulkCreatePermissions(permissionsData: any[]) {
    try {
      const created = [];
      const errors = [];

      for (const permissionData of permissionsData) {
        try {
          const existingPermission = await this.permissionModel
            .findOne({ resource: permissionData.resource, action: permissionData.action })
            .exec();

          if (existingPermission) {
            errors.push({ 
              name: permissionData.name, 
              error: 'Permission already exists' 
            });
            continue;
          }

          const permission = new this.permissionModel(permissionData);
          const savedPermission = await permission.save();
          created.push(savedPermission);

          await this.logAction('permission_bulk_created', savedPermission._id.toString(), 'admin', permissionData);
        } catch (error) {
          errors.push({ name: permissionData.name, error: error.message });
        }
      }

      this.logger.log(`Bulk created ${created.length} permissions with ${errors.length} errors`);
      return { created, errors };
    } catch (error) {
      this.logger.error('Failed to bulk create permissions', error);
      throw error;
    }
  }

  async bulkUpdatePermissions(permissionIds: string[], updates: any) {
    try {
      const result = await this.permissionModel
        .updateMany(
          { _id: { $in: permissionIds } },
          { ...updates, updatedAt: new Date() }
        )
        .exec();

      await this.logAction('permissions_bulk_updated', 'multiple', 'admin', { permissionIds, updates });

      this.logger.log(`Bulk updated ${result.modifiedCount} permissions`);
      return {
        success: true,
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount
      };
    } catch (error) {
      this.logger.error('Failed to bulk update permissions', error);
      throw error;
    }
  }

  async bulkDeletePermissions(permissionIds: string[]) {
    try {
      // Check if any permissions are assigned to roles
      const rolesWithPermissions = await this.roleModel
        .countDocuments({ permissions: { $in: permissionIds } })
        .exec();

      if (rolesWithPermissions > 0) {
        throw new ConflictException('Cannot delete permissions that are assigned to roles');
      }

      const result = await this.permissionModel
        .deleteMany({ _id: { $in: permissionIds } })
        .exec();

      await this.logAction('permissions_bulk_deleted', 'multiple', 'admin', { permissionIds });

      this.logger.log(`Bulk deleted ${result.deletedCount} permissions`);
      return {
        success: true,
        deletedCount: result.deletedCount
      };
    } catch (error) {
      this.logger.error('Failed to bulk delete permissions', error);
      throw error;
    }
  }

  async syncSystemPermissions() {
    try {
      const systemPermissions = this.getSystemPermissions();
      const synced = [];
      const errors = [];

      for (const permissionData of systemPermissions) {
        try {
          const existingPermission = await this.permissionModel
            .findOne({ resource: permissionData.resource, action: permissionData.action })
            .exec();

          if (!existingPermission) {
            const permission = new this.permissionModel(permissionData);
            const savedPermission = await permission.save();
            synced.push(savedPermission);
          }
        } catch (error) {
          errors.push({ name: permissionData.name, error: error.message });
        }
      }

      await this.logAction('system_permissions_synced', 'system', 'admin', { 
        syncedCount: synced.length,
        errorsCount: errors.length
      });

      this.logger.log(`Synced ${synced.length} system permissions with ${errors.length} errors`);
      return { synced, errors };
    } catch (error) {
      this.logger.error('Failed to sync system permissions', error);
      throw error;
    }
  }

  async checkPermissionExists(resource: string, action: string) {
    try {
      const permission = await this.permissionModel
        .findOne({ resource, action })
        .exec();

      return {
        exists: !!permission,
        permission: permission || null
      };
    } catch (error) {
      this.logger.error(`Failed to check permission ${resource}:${action}`, error);
      throw error;
    }
  }

  async clonePermission(id: string, newName: string, newDescription?: string) {
    try {
      const originalPermission = await this.permissionModel.findById(id).exec();
      if (!originalPermission) {
        throw new NotFoundException('Permission not found');
      }

      const clonedPermissionData = {
        name: newName,
        description: newDescription || `Cloned from ${originalPermission.name}`,
        resource: originalPermission.resource + '_clone',
        action: originalPermission.action,
        category: originalPermission.category,
        scope: originalPermission.scope,
        conditions: originalPermission.conditions
      };

      const clonedPermission = new this.permissionModel(clonedPermissionData);
      const savedPermission = await clonedPermission.save();

      await this.logAction('permission_cloned', savedPermission._id.toString(), 'admin', {
        originalPermissionId: id,
        originalPermissionName: originalPermission.name
      });

      this.logger.log(`Permission cloned: ${originalPermission.name} -> ${newName}`);
      return savedPermission;
    } catch (error) {
      this.logger.error(`Failed to clone permission ${id}`, error);
      throw error;
    }
  }

  async getPermissionStatistics() {
    try {
      const [
        totalPermissions,
        byCategory,
        byResource,
        orphanedPermissions
      ] = await Promise.all([
        this.permissionModel.countDocuments().exec(),
        this.permissionModel.aggregate([
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]).exec(),
        this.permissionModel.aggregate([
          { $group: { _id: '$resource', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]).exec(),
        this.permissionModel.aggregate([
          {
            $lookup: {
              from: 'roles',
              localField: '_id',
              foreignField: 'permissions',
              as: 'roles'
            }
          },
          {
            $match: {
              roles: { $size: 0 }
            }
          },
          {
            $count: 'count'
          }
        ]).exec()
      ]);

      return {
        total: totalPermissions,
        byCategory: byCategory.map(item => ({
          category: item._id || 'Uncategorized',
          count: item.count
        })),
        byResource: byResource.map(item => ({
          resource: item._id,
          count: item.count
        })),
        orphaned: orphanedPermissions[0]?.count || 0,
        assigned: totalPermissions - (orphanedPermissions[0]?.count || 0)
      };
    } catch (error) {
      this.logger.error('Failed to get permission statistics', error);
      throw error;
    }
  }

  async exportPermissions(format: string = 'csv') {
    try {
      const permissions = await this.permissionModel.find().exec();

      const exportData = permissions.map(permission => ({
        id: permission._id,
        name: permission.name,
        description: permission.description,
        resource: permission.resource,
        action: permission.action,
        category: permission.category,
        scope: permission.scope,
        conditions: JSON.stringify(permission.conditions || []),
        createdAt: permission.createdAt,
        updatedAt: permission.updatedAt
      }));

      await this.logAction('permissions_exported', 'multiple', 'admin', { 
        format, 
        count: permissions.length 
      });

      this.logger.log(`Exported ${permissions.length} permissions in ${format} format`);
      return {
        data: exportData,
        format,
        count: permissions.length,
        exportedAt: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to export permissions', error);
      throw error;
    }
  }

  async importPermissions(importData: any) {
    try {
      const imported = [];
      const errors = [];

      for (const permissionData of importData.permissions || []) {
        try {
          const existingPermission = await this.permissionModel
            .findOne({ resource: permissionData.resource, action: permissionData.action })
            .exec();

          if (existingPermission) {
            errors.push({ 
              name: permissionData.name, 
              error: 'Permission already exists' 
            });
            continue;
          }

          const permission = new this.permissionModel(permissionData);
          const savedPermission = await permission.save();
          imported.push(savedPermission);

          await this.logAction('permission_imported', savedPermission._id.toString(), 'admin', permissionData);
        } catch (error) {
          errors.push({ name: permissionData.name, error: error.message });
        }
      }

      this.logger.log(`Imported ${imported.length} permissions with ${errors.length} errors`);
      return { imported, errors };
    } catch (error) {
      this.logger.error('Failed to import permissions', error);
      throw error;
    }
  }

  async getPermissionAuditTrail(permissionId: string, pagination: any = {}) {
    try {
      const { page = 1, limit = 10 } = pagination;
      const skip = (page - 1) * limit;

      const [auditLogs, total] = await Promise.all([
        this.auditLogModel
          .find({ resourceId: permissionId, resource: 'permission' })
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.auditLogModel.countDocuments({ resourceId: permissionId, resource: 'permission' }).exec()
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        auditLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get audit trail for permission ${permissionId}`, error);
      throw error;
    }
  }

  async validatePermission(id: string) {
    try {
      const permission = await this.permissionModel.findById(id).exec();
      if (!permission) {
        throw new NotFoundException('Permission not found');
      }

      const validationResult = {
        isValid: true,
        errors: [] as string[],
        warnings: [] as string[]
      };

      // Check for required fields
      if (!permission.name) {
        validationResult.isValid = false;
        validationResult.errors.push('Permission name is required');
      }

      if (!permission.resource) {
        validationResult.isValid = false;
        validationResult.errors.push('Permission resource is required');
      }

      if (!permission.action) {
        validationResult.isValid = false;
        validationResult.errors.push('Permission action is required');
      }

      // Check if permission is assigned to roles
      const roleCount = await this.roleModel.countDocuments({ permissions: id }).exec();
      if (roleCount === 0) {
        validationResult.warnings.push('Permission is not assigned to any roles');
      }

      await this.logAction('permission_validated', id, 'admin', validationResult);

      return validationResult;
    } catch (error) {
      this.logger.error(`Failed to validate permission ${id}`, error);
      throw error;
    }
  }

  async validatePermissionMatrix(matrix: any) {
    try {
      const validationResult = {
        isValid: true,
        errors: [] as string[],
        warnings: [] as string[],
        duplicates: [] as string[],
        missing: [] as string[]
      };

      const systemPermissions = this.getSystemPermissions();
      const matrixPermissions = matrix.permissions || [];

      // Check for duplicates in matrix
      const seen = new Set();
      for (const perm of matrixPermissions) {
        const key = `${perm.resource}:${perm.action}`;
        if (seen.has(key)) {
          validationResult.duplicates.push(key);
          validationResult.isValid = false;
        }
        seen.add(key);
      }

      // Check for missing system permissions
      const matrixKeys = new Set(matrixPermissions.map((p: any) => `${p.resource}:${p.action}`));
      for (const sysPerm of systemPermissions) {
        const key = `${sysPerm.resource}:${sysPerm.action}`;
        if (!matrixKeys.has(key)) {
          validationResult.missing.push(key);
        }
      }

      if (validationResult.missing.length > 0) {
        validationResult.warnings.push(`${validationResult.missing.length} system permissions are missing`);
      }

      await this.logAction('permission_matrix_validated', 'matrix', 'admin', validationResult);

      return validationResult;
    } catch (error) {
      this.logger.error('Failed to validate permission matrix', error);
      throw error;
    }
  }

  async generatePermissionMatrix() {
    try {
      const permissions = await this.permissionModel.find().exec();
      const roles = await this.roleModel.find().populate('permissions').exec();

      const matrix = {
        permissions: permissions.map(p => ({
          id: p._id,
          name: p.name,
          resource: p.resource,
          action: p.action,
          category: p.category
        })),
        roles: roles.map(r => ({
          id: r._id,
          name: r.name,
          permissions: r.permissions.map(p => (p as any)._id || p)
        })),
        matrix: {} as Record<string, Record<string, boolean>>
      };

      // Build permission matrix
      roles.forEach(role => {
        (matrix.matrix as any)[role._id.toString()] = {};
        permissions.forEach(permission => {
          (matrix.matrix as any)[role._id.toString()][permission._id.toString()] = 
            role.permissions.some(p => (p as any)._id?.toString() === permission._id.toString() || p.toString() === permission._id.toString());
        });
      });

      await this.logAction('permission_matrix_generated', 'matrix', 'admin');

      return matrix;
    } catch (error) {
      this.logger.error('Failed to generate permission matrix', error);
      throw error;
    }
  }

  async cleanupOrphanedPermissions() {
    try {
      const orphanedPermissions = await this.permissionModel.aggregate([
        {
          $lookup: {
            from: 'roles',
            localField: '_id',
            foreignField: 'permissions',
            as: 'roles'
          }
        },
        {
          $match: {
            roles: { $size: 0 }
          }
        }
      ]).exec();

      const orphanedIds = orphanedPermissions.map(p => p._id);
      
      if (orphanedIds.length > 0) {
        await this.permissionModel.deleteMany({ _id: { $in: orphanedIds } }).exec();
      }

      await this.logAction('orphaned_permissions_cleaned', 'cleanup', 'admin', {
        cleanedCount: orphanedIds.length,
        orphanedIds
      });

      this.logger.log(`Cleaned up ${orphanedIds.length} orphaned permissions`);
      return {
        success: true,
        cleanedCount: orphanedIds.length,
        orphanedPermissions
      };
    } catch (error) {
      this.logger.error('Failed to cleanup orphaned permissions', error);
      throw error;
    }
  }

  // Private helper methods
  private getSystemPermissions() {
    return [
      // User Management
      { name: 'View Users', resource: 'users', action: 'read', category: 'User Management' },
      { name: 'Create Users', resource: 'users', action: 'create', category: 'User Management' },
      { name: 'Update Users', resource: 'users', action: 'update', category: 'User Management' },
      { name: 'Delete Users', resource: 'users', action: 'delete', category: 'User Management' },
      
      // Role Management
      { name: 'View Roles', resource: 'roles', action: 'read', category: 'Role Management' },
      { name: 'Create Roles', resource: 'roles', action: 'create', category: 'Role Management' },
      { name: 'Update Roles', resource: 'roles', action: 'update', category: 'Role Management' },
      { name: 'Delete Roles', resource: 'roles', action: 'delete', category: 'Role Management' },
      
      // Permission Management
      { name: 'View Permissions', resource: 'permissions', action: 'read', category: 'Permission Management' },
      { name: 'Create Permissions', resource: 'permissions', action: 'create', category: 'Permission Management' },
      { name: 'Update Permissions', resource: 'permissions', action: 'update', category: 'Permission Management' },
      { name: 'Delete Permissions', resource: 'permissions', action: 'delete', category: 'Permission Management' },
      
      // Invoice Management
      { name: 'View Invoices', resource: 'invoices', action: 'read', category: 'Invoice Management' },
      { name: 'Create Invoices', resource: 'invoices', action: 'create', category: 'Invoice Management' },
      { name: 'Update Invoices', resource: 'invoices', action: 'update', category: 'Invoice Management' },
      { name: 'Delete Invoices', resource: 'invoices', action: 'delete', category: 'Invoice Management' },
      { name: 'Send Invoices', resource: 'invoices', action: 'send', category: 'Invoice Management' },
      
      // Payment Management
      { name: 'View Payments', resource: 'payments', action: 'read', category: 'Payment Management' },
      { name: 'Process Payments', resource: 'payments', action: 'create', category: 'Payment Management' },
      { name: 'Refund Payments', resource: 'payments', action: 'refund', category: 'Payment Management' },
      
      // Client Management
      { name: 'View Clients', resource: 'clients', action: 'read', category: 'Client Management' },
      { name: 'Create Clients', resource: 'clients', action: 'create', category: 'Client Management' },
      { name: 'Update Clients', resource: 'clients', action: 'update', category: 'Client Management' },
      { name: 'Delete Clients', resource: 'clients', action: 'delete', category: 'Client Management' },
      
      // Project Management
      { name: 'View Projects', resource: 'projects', action: 'read', category: 'Project Management' },
      { name: 'Create Projects', resource: 'projects', action: 'create', category: 'Project Management' },
      { name: 'Update Projects', resource: 'projects', action: 'update', category: 'Project Management' },
      { name: 'Delete Projects', resource: 'projects', action: 'delete', category: 'Project Management' },
      
      // Expense Management
      { name: 'View Expenses', resource: 'expenses', action: 'read', category: 'Expense Management' },
      { name: 'Create Expenses', resource: 'expenses', action: 'create', category: 'Expense Management' },
      { name: 'Update Expenses', resource: 'expenses', action: 'update', category: 'Expense Management' },
      { name: 'Delete Expenses', resource: 'expenses', action: 'delete', category: 'Expense Management' },
      { name: 'Approve Expenses', resource: 'expenses', action: 'approve', category: 'Expense Management' },
      
      // Time Tracking
      { name: 'View Time Entries', resource: 'time_entries', action: 'read', category: 'Time Tracking' },
      { name: 'Create Time Entries', resource: 'time_entries', action: 'create', category: 'Time Tracking' },
      { name: 'Update Time Entries', resource: 'time_entries', action: 'update', category: 'Time Tracking' },
      { name: 'Delete Time Entries', resource: 'time_entries', action: 'delete', category: 'Time Tracking' },
      
      // Reports
      { name: 'View Reports', resource: 'reports', action: 'read', category: 'Reports' },
      { name: 'Generate Reports', resource: 'reports', action: 'create', category: 'Reports' },
      { name: 'Export Reports', resource: 'reports', action: 'export', category: 'Reports' },
      
      // System Administration
      { name: 'View System Settings', resource: 'system_settings', action: 'read', category: 'System Administration' },
      { name: 'Update System Settings', resource: 'system_settings', action: 'update', category: 'System Administration' },
      { name: 'View Audit Logs', resource: 'audit_logs', action: 'read', category: 'System Administration' },
      { name: 'Backup System', resource: 'system', action: 'backup', category: 'System Administration' },
      { name: 'Restore System', resource: 'system', action: 'restore', category: 'System Administration' }
    ];
  }

  private async logAction(action: string, resourceId: string, userId: string, metadata?: any) {
    try {
      await this.auditLogModel.create({
        userId,
        action,
        resource: 'permission',
        resourceId,
        metadata,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to log action', error);
    }
  }
}
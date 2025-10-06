import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from '../schemas/role.schema';
import { Permission, PermissionDocument } from '../schemas/permission.schema';
import { AuditLog, AuditLogDocument } from '../schemas/audit-log.schema';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(Permission.name) private permissionModel: Model<PermissionDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async getRoles(filters: any = {}, pagination: any = {}, sorting: any = {}) {
    try {
      const { search, status } = filters;
      const { page = 1, limit = 10 } = pagination;
      const { sortBy = 'createdAt', sortOrder = 'desc' } = sorting;

      const query: any = {};

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      if (status) {
        query.status = status;
      }

      const skip = (page - 1) * limit;
      const sortObj = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      const sortObject = Object.keys(sortObj).reduce((acc, key) => {
        acc[key] = (sortObj as any)[key] > 0 ? 1 : -1;
        return acc;
      }, {} as Record<string, 1 | -1>);

      const [roles, total] = await Promise.all([
        this.roleModel
          .find(query)
          .populate('permissions')
          .sort(sortObject)
          .skip(skip)
          .limit(limit)
          .exec(),
        this.roleModel.countDocuments(query).exec()
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
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
      this.logger.error('Failed to get roles', error);
      throw error;
    }
  }

  async getRoleById(id: string) {
    try {
      const role = await this.roleModel
        .findById(id)
        .populate('permissions')
        .exec();

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      return role;
    } catch (error) {
      this.logger.error(`Failed to get role ${id}`, error);
      throw error;
    }
  }

  async getRolePermissions(id: string) {
    try {
      const role = await this.roleModel
        .findById(id)
        .populate('permissions')
        .exec();

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      return {
        roleId: id,
        roleName: role.name,
        permissions: role.permissions
      };
    } catch (error) {
      this.logger.error(`Failed to get permissions for role ${id}`, error);
      throw error;
    }
  }

  async getRoleUsers(id: string, pagination: any = {}) {
    try {
      const { page = 1, limit = 10 } = pagination;
      const skip = (page - 1) * limit;

      const role = await this.roleModel.findById(id).exec();
      if (!role) {
        throw new NotFoundException('Role not found');
      }

      const [users, total] = await Promise.all([
        this.userModel
          .find({ roles: id })
          .select('username email firstName lastName status lastLoginAt')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.userModel.countDocuments({ roles: id }).exec()
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        role: { id: role._id, name: role.name },
        users,
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
      this.logger.error(`Failed to get users for role ${id}`, error);
      throw error;
    }
  }

  async createRole(roleData: any) {
    try {
      // Check if role already exists
      const existingRole = await this.roleModel.findOne({ name: roleData.name }).exec();
      if (existingRole) {
        throw new ConflictException('Role with this name already exists');
      }

      const role = new this.roleModel(roleData);
      const savedRole = await role.save();

      // Log the action
      await this.logAction('role_created', savedRole._id.toString(), 'admin', roleData);

      this.logger.log(`Role created: ${savedRole.name}`);
      return savedRole;
    } catch (error) {
      this.logger.error('Failed to create role', error);
      throw error;
    }
  }

  async updateRole(id: string, updateData: any) {
    try {
      const role = await this.roleModel.findById(id).exec();
      if (!role) {
        throw new NotFoundException('Role not found');
      }

      // Check for name conflicts if name is being updated
      if (updateData.name && updateData.name !== role.name) {
        const existingRole = await this.roleModel.findOne({ name: updateData.name }).exec();
        if (existingRole) {
          throw new ConflictException('Role with this name already exists');
        }
      }

      const updatedRole = await this.roleModel
        .findByIdAndUpdate(id, { ...updateData, updatedAt: new Date() }, { new: true })
        .populate('permissions')
        .exec();

      await this.logAction('role_updated', id, 'admin', updateData);

      this.logger.log(`Role updated: ${updatedRole?.name || id}`);
      return updatedRole;
    } catch (error) {
      this.logger.error(`Failed to update role ${id}`, error);
      throw error;
    }
  }

  async assignPermissions(roleId: string, permissionIds: string[]) {
    try {
      const role = await this.roleModel.findById(roleId).exec();
      if (!role) {
        throw new NotFoundException('Role not found');
      }

      // Validate permissions exist
      const permissions = await this.permissionModel.find({ _id: { $in: permissionIds } }).exec();
      if (permissions.length !== permissionIds.length) {
        throw new NotFoundException('One or more permissions not found');
      }

      const updatedRole = await this.roleModel
        .findByIdAndUpdate(
          roleId,
          { 
            permissions: permissionIds,
            updatedAt: new Date()
          },
          { new: true }
        )
        .populate('permissions')
        .exec();

      await this.logAction('permissions_assigned', roleId, 'admin', { permissionIds });

      this.logger.log(`Permissions assigned to role: ${role.name}`);
      return updatedRole;
    } catch (error) {
      this.logger.error(`Failed to assign permissions to role ${roleId}`, error);
      throw error;
    }
  }

  async removePermission(roleId: string, permissionId: string) {
    try {
      const role = await this.roleModel.findById(roleId).exec();
      if (!role) {
        throw new NotFoundException('Role not found');
      }

      const updatedRole = await this.roleModel
        .findByIdAndUpdate(
          roleId,
          { 
            $pull: { permissions: permissionId },
            updatedAt: new Date()
          },
          { new: true }
        )
        .populate('permissions')
        .exec();

      await this.logAction('permission_removed', roleId, 'admin', { permissionId });

      this.logger.log(`Permission removed from role: ${role.name}`);
      return updatedRole;
    } catch (error) {
      this.logger.error(`Failed to remove permission from role ${roleId}`, error);
      throw error;
    }
  }

  async activateRole(id: string) {
    try {
      const role = await this.roleModel
        .findByIdAndUpdate(
          id,
          { status: 'active', updatedAt: new Date() },
          { new: true }
        )
        .exec();

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      await this.logAction('role_activated', id, 'admin');

      this.logger.log(`Role activated: ${role.name}`);
      return role;
    } catch (error) {
      this.logger.error(`Failed to activate role ${id}`, error);
      throw error;
    }
  }

  async deactivateRole(id: string) {
    try {
      const role = await this.roleModel
        .findByIdAndUpdate(
          id,
          { status: 'inactive', updatedAt: new Date() },
          { new: true }
        )
        .exec();

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      await this.logAction('role_deactivated', id, 'admin');

      this.logger.log(`Role deactivated: ${role.name}`);
      return role;
    } catch (error) {
      this.logger.error(`Failed to deactivate role ${id}`, error);
      throw error;
    }
  }

  async deleteRole(id: string) {
    try {
      const role = await this.roleModel.findById(id).exec();
      if (!role) {
        throw new NotFoundException('Role not found');
      }

      // Check if role is assigned to users
      const usersWithRole = await this.userModel.countDocuments({ roles: id }).exec();
      if (usersWithRole > 0) {
        throw new ConflictException('Cannot delete role that is assigned to users');
      }

      await this.roleModel.findByIdAndDelete(id).exec();

      await this.logAction('role_deleted', id, 'admin', { roleName: role.name });

      this.logger.log(`Role deleted: ${role.name}`);
      return { success: true, message: 'Role deleted successfully' };
    } catch (error) {
      this.logger.error(`Failed to delete role ${id}`, error);
      throw error;
    }
  }

  async bulkCreateRoles(rolesData: any[]) {
    try {
      const createdRoles = [];
      const errors = [];

      for (const roleData of rolesData) {
        try {
          const existingRole = await this.roleModel.findOne({ name: roleData.name }).exec();
          if (existingRole) {
            errors.push({ name: roleData.name, error: 'Role already exists' });
            continue;
          }

          const role = new this.roleModel(roleData);
          const savedRole = await role.save();
          createdRoles.push(savedRole);

          await this.logAction('role_bulk_created', savedRole._id.toString(), 'admin', roleData);
        } catch (error) {
          errors.push({ name: roleData.name, error: error.message });
        }
      }

      this.logger.log(`Bulk created ${createdRoles.length} roles with ${errors.length} errors`);
      return { created: createdRoles, errors };
    } catch (error) {
      this.logger.error('Failed to bulk create roles', error);
      throw error;
    }
  }

  async bulkUpdateRoles(roleIds: string[], updates: any) {
    try {
      const result = await this.roleModel
        .updateMany(
          { _id: { $in: roleIds } },
          { ...updates, updatedAt: new Date() }
        )
        .exec();

      await this.logAction('roles_bulk_updated', 'multiple', 'admin', { roleIds, updates });

      this.logger.log(`Bulk updated ${result.modifiedCount} roles`);
      return {
        success: true,
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount
      };
    } catch (error) {
      this.logger.error('Failed to bulk update roles', error);
      throw error;
    }
  }

  async bulkDeleteRoles(roleIds: string[]) {
    try {
      // Check if any roles are assigned to users
      const usersWithRoles = await this.userModel
        .countDocuments({ roles: { $in: roleIds } })
        .exec();

      if (usersWithRoles > 0) {
        throw new ConflictException('Cannot delete roles that are assigned to users');
      }

      const result = await this.roleModel
        .deleteMany({ _id: { $in: roleIds } })
        .exec();

      await this.logAction('roles_bulk_deleted', 'multiple', 'admin', { roleIds });

      this.logger.log(`Bulk deleted ${result.deletedCount} roles`);
      return {
        success: true,
        deletedCount: result.deletedCount
      };
    } catch (error) {
      this.logger.error('Failed to bulk delete roles', error);
      throw error;
    }
  }

  async bulkActivateRoles(roleIds: string[]) {
    try {
      const result = await this.roleModel
        .updateMany(
          { _id: { $in: roleIds } },
          { status: 'active', updatedAt: new Date() }
        )
        .exec();

      await this.logAction('roles_bulk_activated', 'multiple', 'admin', { roleIds });

      this.logger.log(`Bulk activated ${result.modifiedCount} roles`);
      return {
        success: true,
        modifiedCount: result.modifiedCount
      };
    } catch (error) {
      this.logger.error('Failed to bulk activate roles', error);
      throw error;
    }
  }

  async bulkDeactivateRoles(roleIds: string[]) {
    try {
      const result = await this.roleModel
        .updateMany(
          { _id: { $in: roleIds } },
          { status: 'inactive', updatedAt: new Date() }
        )
        .exec();

      await this.logAction('roles_bulk_deactivated', 'multiple', 'admin', { roleIds });

      this.logger.log(`Bulk deactivated ${result.modifiedCount} roles`);
      return {
        success: true,
        modifiedCount: result.modifiedCount
      };
    } catch (error) {
      this.logger.error('Failed to bulk deactivate roles', error);
      throw error;
    }
  }

  async getRoleHierarchy() {
    try {
      const roles = await this.roleModel
        .find()
        .populate('permissions')
        .sort({ level: 1, name: 1 })
        .exec();

      // Build hierarchy tree
      const hierarchy = this.buildRoleHierarchy(roles);

      return hierarchy;
    } catch (error) {
      this.logger.error('Failed to get role hierarchy', error);
      throw error;
    }
  }

  async cloneRole(id: string, newName: string, newDescription?: string) {
    try {
      const originalRole = await this.roleModel
        .findById(id)
        .populate('permissions')
        .exec();

      if (!originalRole) {
        throw new NotFoundException('Role not found');
      }

      // Check if new name already exists
      const existingRole = await this.roleModel.findOne({ name: newName }).exec();
      if (existingRole) {
        throw new ConflictException('Role with this name already exists');
      }

      const clonedRoleData = {
        name: newName,
        description: newDescription || `Cloned from ${originalRole.name}`,
        permissions: originalRole.permissions.map(p => (p as any)._id || p),
        level: originalRole.level,
        isSystemRole: false
      };

      const clonedRole = new this.roleModel(clonedRoleData);
      const savedRole = await clonedRole.save();

      await this.logAction('role_cloned', savedRole._id.toString(), 'admin', {
        originalRoleId: id,
        originalRoleName: originalRole.name
      });

      this.logger.log(`Role cloned: ${originalRole.name} -> ${newName}`);
      return savedRole;
    } catch (error) {
      this.logger.error(`Failed to clone role ${id}`, error);
      throw error;
    }
  }

  async getRoleStatistics() {
    try {
      const [
        totalRoles,
        activeRoles,
        inactiveRoles,
        systemRoles,
        customRoles,
        rolesWithUsers
      ] = await Promise.all([
        this.roleModel.countDocuments().exec(),
        this.roleModel.countDocuments({ status: 'active' }).exec(),
        this.roleModel.countDocuments({ status: 'inactive' }).exec(),
        this.roleModel.countDocuments({ isSystemRole: true }).exec(),
        this.roleModel.countDocuments({ isSystemRole: false }).exec(),
        this.roleModel.aggregate([
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: 'roles',
              as: 'users'
            }
          },
          {
            $match: {
              'users.0': { $exists: true }
            }
          },
          {
            $count: 'count'
          }
        ]).exec()
      ]);

      return {
        total: totalRoles,
        active: activeRoles,
        inactive: inactiveRoles,
        system: systemRoles,
        custom: customRoles,
        withUsers: rolesWithUsers[0]?.count || 0,
        withoutUsers: totalRoles - (rolesWithUsers[0]?.count || 0)
      };
    } catch (error) {
      this.logger.error('Failed to get role statistics', error);
      throw error;
    }
  }

  async exportRoles(format: string = 'csv') {
    try {
      const roles = await this.roleModel
        .find()
        .populate('permissions')
        .exec();

      const exportData = roles.map(role => ({
        id: role._id,
        name: role.name,
        description: role.description,
        status: (role as any).status,
        isSystemRole: role.isSystem,
        level: (role as any).level,
        permissions: role.permissions.map(p => (p as any).name || p).join(', '),
        createdAt: role.createdAt,
        updatedAt: role.updatedAt
      }));

      await this.logAction('roles_exported', 'multiple', 'admin', { format, count: roles.length });

      this.logger.log(`Exported ${roles.length} roles in ${format} format`);
      return {
        data: exportData,
        format,
        count: roles.length,
        exportedAt: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to export roles', error);
      throw error;
    }
  }

  async importRoles(importData: any) {
    try {
      const imported = [];
      const errors = [];

      for (const roleData of importData.roles || []) {
        try {
          const existingRole = await this.roleModel.findOne({ name: roleData.name }).exec();
          if (existingRole) {
            errors.push({ name: roleData.name, error: 'Role already exists' });
            continue;
          }

          const role = new this.roleModel(roleData);
          const savedRole = await role.save();
          imported.push(savedRole);

          await this.logAction('role_imported', savedRole._id.toString(), 'admin', roleData);
        } catch (error) {
          errors.push({ name: roleData.name, error: error.message });
        }
      }

      this.logger.log(`Imported ${imported.length} roles with ${errors.length} errors`);
      return { imported, errors };
    } catch (error) {
      this.logger.error('Failed to import roles', error);
      throw error;
    }
  }

  async getRoleAuditTrail(roleId: string, pagination: any = {}) {
    try {
      const { page = 1, limit = 10 } = pagination;
      const skip = (page - 1) * limit;

      const [auditLogs, total] = await Promise.all([
        this.auditLogModel
          .find({ resourceId: roleId, resource: 'role' })
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.auditLogModel.countDocuments({ resourceId: roleId, resource: 'role' }).exec()
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
      this.logger.error(`Failed to get audit trail for role ${roleId}`, error);
      throw error;
    }
  }

  async validateRole(id: string) {
    try {
      const role = await this.roleModel
        .findById(id)
        .populate('permissions')
        .exec();

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      const validationResult = {
        isValid: true,
        errors: [] as string[],
        warnings: [] as string[]
      };

      // Check for required fields
      if (!role.name) {
        validationResult.isValid = false;
        validationResult.errors.push('Role name is required');
      }

      // Check for duplicate permissions
      const permissionIds = role.permissions.map(p => (p as any)._id?.toString() || p.toString());
      const uniquePermissionIds = [...new Set(permissionIds)];
      if (permissionIds.length !== uniquePermissionIds.length) {
        validationResult.warnings.push('Role has duplicate permissions');
      }

      // Check if role has users assigned
      const userCount = await this.userModel.countDocuments({ roles: id }).exec();
      if (userCount === 0) {
        validationResult.warnings.push('Role is not assigned to any users');
      }

      await this.logAction('role_validated', id, 'admin', validationResult);

      return validationResult;
    } catch (error) {
      this.logger.error(`Failed to validate role ${id}`, error);
      throw error;
    }
  }

  // Private helper methods
  private buildRoleHierarchy(roles: any[]): any[] {
    const hierarchy = [];
    const roleMap = new Map();

    // Create a map of roles by level
    roles.forEach(role => {
      if (!roleMap.has(role.level)) {
        roleMap.set(role.level, []);
      }
      roleMap.get(role.level).push(role);
    });

    // Build the hierarchy
    for (const [level, levelRoles] of roleMap.entries()) {
      hierarchy.push({
        level,
        roles: levelRoles
      });
    }

    return hierarchy.sort((a, b) => a.level - b.level);
  }

  private async logAction(action: string, resourceId: string, userId: string, metadata?: any) {
    try {
      await this.auditLogModel.create({
        userId,
        action,
        resource: 'role',
        resourceId,
        metadata,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to log action', error);
    }
  }
}
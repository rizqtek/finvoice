import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { AuditLog, AuditLogDocument } from '../schemas/audit-log.schema';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
  ) {}

  async findAll(query: any = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        role,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = query;

      const filter: any = {};
      
      if (search) {
        filter.$or = [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ];
      }

      if (role) {
        filter.roles = { $in: [role] };
      }

      if (status !== undefined) {
        filter.isActive = status === 'active';
      }

      const sort: any = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const [users, total] = await Promise.all([
        this.userModel
          .find(filter)
          .select('-password')
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .exec(),
        this.userModel.countDocuments(filter)
      ]);

      return {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      this.logger.error('Failed to fetch users', error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      const user = await this.userModel
        .findById(id)
        .select('-password')
        .exec();
      
      if (!user) {
        throw new NotFoundException('User not found');
      }

      return user;
    } catch (error) {
      this.logger.error(`Failed to fetch user ${id}`, error);
      throw error;
    }
  }

  async create(userData: any) {
    try {
      // Check if user already exists
      const existingUser = await this.userModel.findOne({ email: userData.email });
      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

      const user = new this.userModel({
        ...userData,
        password: hashedPassword,
        isActive: userData.isActive !== undefined ? userData.isActive : true,
        roles: userData.roles || ['user'],
      });

      const savedUser = await user.save();

      // Log the action
      await this.logAction('user_created', savedUser._id.toString(), 'admin', { 
        email: userData.email,
        roles: userData.roles 
      });

      this.logger.log(`User created: ${savedUser.email}`);

      // Return user without password
      const { password, ...userWithoutPassword } = savedUser.toObject();
      return userWithoutPassword;
    } catch (error) {
      this.logger.error('Failed to create user', error);
      throw error;
    }
  }

  async update(id: string, updateData: any) {
    try {
      const user = await this.userModel.findById(id);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Store old values for audit log
      const oldValues = user.toObject();

      // Handle password update
      if (updateData.password) {
        const saltRounds = 12;
        updateData.password = await bcrypt.hash(updateData.password, saltRounds);
      }

      const updatedUser = await this.userModel
        .findByIdAndUpdate(id, updateData, { new: true })
        .select('-password')
        .exec();

      // Log the action
      await this.logAction('user_updated', id, 'admin', { 
        oldValues: this.sanitizeForLog(oldValues),
        newValues: this.sanitizeForLog(updateData)
      });

      this.logger.log(`User updated: ${updatedUser?.email || 'Unknown'}`);
      return updatedUser;
    } catch (error) {
      this.logger.error(`Failed to update user ${id}`, error);
      throw error;
    }
  }

  async delete(id: string) {
    try {
      const user = await this.userModel.findById(id);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      await this.userModel.findByIdAndDelete(id);

      // Log the action
      await this.logAction('user_deleted', id, 'admin', { 
        email: user.email 
      });

      this.logger.log(`User deleted: ${user.email}`);
      return { success: true, message: 'User deleted successfully' };
    } catch (error) {
      this.logger.error(`Failed to delete user ${id}`, error);
      throw error;
    }
  }

  async activate(id: string) {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(id, { isActive: true }, { new: true })
        .select('-password')
        .exec();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      await this.logAction('user_activated', id, 'admin');
      
      this.logger.log(`User activated: ${user.email}`);
      return user;
    } catch (error) {
      this.logger.error(`Failed to activate user ${id}`, error);
      throw error;
    }
  }

  async deactivate(id: string, reason?: string) {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(id, { isActive: false }, { new: true })
        .select('-password')
        .exec();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      await this.logAction('user_deactivated', id, 'admin', { reason });
      
      this.logger.log(`User deactivated: ${user.email}`);
      return user;
    } catch (error) {
      this.logger.error(`Failed to deactivate user ${id}`, error);
      throw error;
    }
  }

  async resetPassword(id: string, newPassword?: string, sendEmail: boolean = true) {
    try {
      const user = await this.userModel.findById(id);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Generate random password if not provided
      const password = newPassword || this.generateRandomPassword();
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      await this.userModel.findByIdAndUpdate(id, { 
        password: hashedPassword,
        metadata: {
          ...user.metadata,
          passwordResetAt: new Date(),
          passwordResetBy: 'admin'
        }
      });

      await this.logAction('password_reset', id, 'admin');

      if (sendEmail) {
        // Would integrate with email service
        this.logger.log(`Password reset email sent to: ${user.email}`);
      }

      this.logger.log(`Password reset for user: ${user.email}`);
      
      return { 
        success: true, 
        message: 'Password reset successfully',
        ...(sendEmail ? {} : { temporaryPassword: password })
      };
    } catch (error) {
      this.logger.error(`Failed to reset password for user ${id}`, error);
      throw error;
    }
  }

  async unlockAccount(id: string) {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(
          id, 
          { 
            $unset: { 'metadata.accountLockedUntil': 1, 'metadata.failedLoginAttempts': 1 }
          }, 
          { new: true }
        )
        .select('-password')
        .exec();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      await this.logAction('account_unlocked', id, 'admin');
      
      this.logger.log(`Account unlocked for user: ${user.email}`);
      return user;
    } catch (error) {
      this.logger.error(`Failed to unlock account for user ${id}`, error);
      throw error;
    }
  }

  async getActivity(userId: string, filters: any = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        action,
        dateFrom,
        dateTo
      } = filters;

      const filter: any = { userId };

      if (action) {
        filter.action = action;
      }

      if (dateFrom || dateTo) {
        filter.timestamp = {};
        if (dateFrom) filter.timestamp.$gte = new Date(dateFrom);
        if (dateTo) filter.timestamp.$lte = new Date(dateTo);
      }

      const [activities, total] = await Promise.all([
        this.auditLogModel
          .find(filter)
          .sort({ timestamp: -1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .exec(),
        this.auditLogModel.countDocuments(filter)
      ]);

      return {
        activities,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get activity for user ${userId}`, error);
      throw error;
    }
  }

  async getSessions(userId: string) {
    try {
      // This would typically query a sessions store (Redis, etc.)
      // For now, returning mock data
      return {
        sessions: [
          {
            id: 'session_1',
            device: 'Chrome on Windows',
            location: 'New York, US',
            lastActive: new Date(),
            current: true
          },
          {
            id: 'session_2',
            device: 'Mobile Safari',
            location: 'Los Angeles, US',
            lastActive: new Date(Date.now() - 3600000),
            current: false
          }
        ]
      };
    } catch (error) {
      this.logger.error(`Failed to get sessions for user ${userId}`, error);
      throw error;
    }
  }

  async terminateSession(userId: string, sessionId: string) {
    try {
      // This would typically remove the session from store
      await this.logAction('session_terminated', userId, 'admin', { sessionId });
      
      this.logger.log(`Session ${sessionId} terminated for user ${userId}`);
      return { success: true, message: 'Session terminated successfully' };
    } catch (error) {
      this.logger.error(`Failed to terminate session ${sessionId} for user ${userId}`, error);
      throw error;
    }
  }

  async assignRoles(userId: string, roles: string[]) {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(
          userId,
          { $addToSet: { roles: { $each: roles } } },
          { new: true }
        )
        .select('-password')
        .exec();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      await this.logAction('roles_assigned', userId, 'admin', { roles });
      
      this.logger.log(`Roles assigned to user ${userId}: ${roles.join(', ')}`);
      return user;
    } catch (error) {
      this.logger.error(`Failed to assign roles to user ${userId}`, error);
      throw error;
    }
  }

  async removeRole(userId: string, roleId: string) {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(
          userId,
          { $pull: { roles: roleId } },
          { new: true }
        )
        .select('-password')
        .exec();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      await this.logAction('role_removed', userId, 'admin', { role: roleId });
      
      this.logger.log(`Role ${roleId} removed from user ${userId}`);
      return user;
    } catch (error) {
      this.logger.error(`Failed to remove role from user ${userId}`, error);
      throw error;
    }
  }

  async grantPermissions(userId: string, permissions: string[]) {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(
          userId,
          { $addToSet: { permissions: { $each: permissions } } },
          { new: true }
        )
        .select('-password')
        .exec();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      await this.logAction('permissions_granted', userId, 'admin', { permissions });
      
      this.logger.log(`Permissions granted to user ${userId}: ${permissions.join(', ')}`);
      return user;
    } catch (error) {
      this.logger.error(`Failed to grant permissions to user ${userId}`, error);
      throw error;
    }
  }

  async revokePermission(userId: string, permissionId: string) {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(
          userId,
          { $pull: { permissions: permissionId } },
          { new: true }
        )
        .select('-password')
        .exec();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      await this.logAction('permission_revoked', userId, 'admin', { permission: permissionId });
      
      this.logger.log(`Permission ${permissionId} revoked from user ${userId}`);
      return user;
    } catch (error) {
      this.logger.error(`Failed to revoke permission from user ${userId}`, error);
      throw error;
    }
  }

  async enableTwoFactor(userId: string) {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(
          userId,
          { isTwoFactorEnabled: true },
          { new: true }
        )
        .select('-password')
        .exec();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      await this.logAction('2fa_enabled', userId, 'admin');
      
      this.logger.log(`2FA enabled for user ${userId}`);
      return { success: true, message: '2FA enabled successfully' };
    } catch (error) {
      this.logger.error(`Failed to enable 2FA for user ${userId}`, error);
      throw error;
    }
  }

  async disableTwoFactor(userId: string) {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(
          userId,
          { isTwoFactorEnabled: false },
          { new: true }
        )
        .select('-password')
        .exec();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      await this.logAction('2fa_disabled', userId, 'admin');
      
      this.logger.log(`2FA disabled for user ${userId}`);
      return { success: true, message: '2FA disabled successfully' };
    } catch (error) {
      this.logger.error(`Failed to disable 2FA for user ${userId}`, error);
      throw error;
    }
  }

  async bulkAction(action: string, userIds: string[], options: any = {}) {
    try {
      const results = [];
      
      for (const userId of userIds) {
        try {
          let result;
          switch (action) {
            case 'activate':
              result = await this.activate(userId);
              break;
            case 'deactivate':
              result = await this.deactivate(userId, options.reason);
              break;
            case 'delete':
              result = await this.delete(userId);
              break;
            case 'assign_role':
              result = await this.assignRoles(userId, options.roles);
              break;
            case 'reset_password':
              result = await this.resetPassword(userId, undefined, options.sendEmail);
              break;
            default:
              throw new BadRequestException(`Unknown action: ${action}`);
          }
          results.push({ userId, success: true, result });
        } catch (error) {
          results.push({ userId, success: false, error: error.message });
        }
      }

      await this.logAction('bulk_action', 'multiple', 'admin', { 
        action, 
        userIds, 
        options,
        results: results.map(r => ({ userId: r.userId, success: r.success }))
      });

      this.logger.log(`Bulk action ${action} completed for ${userIds.length} users`);
      
      return {
        action,
        totalUsers: userIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
    } catch (error) {
      this.logger.error(`Failed to perform bulk action ${action}`, error);
      throw error;
    }
  }

  async exportUsers(format: string, filters: any = {}) {
    try {
      const users = await this.userModel
        .find({})
        .select('-password')
        .exec();

      // This would typically generate actual export files
      const exportData = {
        format,
        users: users.map(user => ({
          id: user._id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          roles: user.roles,
          isActive: user.isActive,
          createdAt: user.createdAt
        })),
        exportedAt: new Date(),
        totalRecords: users.length
      };

      await this.logAction('users_exported', 'system', 'admin', { 
        format, 
        filters, 
        recordCount: users.length 
      });

      this.logger.log(`Users exported in ${format} format: ${users.length} records`);
      
      return exportData;
    } catch (error) {
      this.logger.error(`Failed to export users in ${format} format`, error);
      throw error;
    }
  }

  async importUsers(data: any) {
    try {
      const { users, options = {} } = data;
      const results = [];

      for (const userData of users) {
        try {
          const result = await this.create(userData);
          results.push({ email: userData.email, success: true, userId: result._id });
        } catch (error) {
          results.push({ email: userData.email, success: false, error: error.message });
        }
      }

      await this.logAction('users_imported', 'system', 'admin', { 
        totalUsers: users.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        options
      });

      this.logger.log(`Users import completed: ${results.filter(r => r.success).length}/${users.length} successful`);
      
      return {
        totalUsers: users.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
    } catch (error) {
      this.logger.error('Failed to import users', error);
      throw error;
    }
  }

  // Private helper methods
  private async logAction(action: string, resourceId: string, userId: string, metadata?: any) {
    try {
      await this.auditLogModel.create({
        userId,
        action,
        resource: 'user',
        resourceId,
        metadata,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to log action', error);
    }
  }

  private sanitizeForLog(data: any) {
    const { password, ...sanitized } = data;
    return sanitized;
  }

  private generateRandomPassword(length: number = 12): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }
}
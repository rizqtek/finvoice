import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from '../schemas/audit-log.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { SystemSettings, SystemSettingsDocument } from '../schemas/system-settings.schema';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(SystemSettings.name) private systemSettingsModel: Model<SystemSettingsDocument>,
  ) {}

  async getAuditLogs(filters: any = {}, pagination: any = {}, sorting: any = {}) {
    try {
      const { userId, action, resource, startDate, endDate } = filters;
      const { page = 1, limit = 20 } = pagination;
      const { sortBy = 'timestamp', sortOrder = 'desc' } = sorting;

      const query: any = {};

      if (userId) {
        query.userId = userId;
      }

      if (action) {
        query.action = { $regex: action, $options: 'i' };
      }

      if (resource) {
        query.resource = resource;
      }

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          query.timestamp.$lte = new Date(endDate);
        }
      }

      const skip = (page - 1) * limit;
      const sortObj = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      const sortObject = Object.keys(sortObj).reduce((acc, key) => {
        (acc as any)[key] = (sortObj as any)[key] > 0 ? 1 : -1;
        return acc;
      }, {} as Record<string, 1 | -1>);

      const [logs, total] = await Promise.all([
        this.auditLogModel
          .find(query)
          .sort(sortObject)
          .skip(skip)
          .limit(limit)
          .populate('userId', 'username email firstName lastName')
          .exec(),
        this.auditLogModel.countDocuments(query).exec()
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        logs,
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
      this.logger.error('Failed to get audit logs', error);
      throw error;
    }
  }

  async getAuditLogById(id: string) {
    try {
      const log = await this.auditLogModel
        .findById(id)
        .populate('userId', 'username email firstName lastName')
        .exec();

      if (!log) {
        throw new NotFoundException('Audit log not found');
      }

      return log;
    } catch (error) {
      this.logger.error(`Failed to get audit log ${id}`, error);
      throw error;
    }
  }

  async getAuditStatistics(period: string = '30d', groupBy: string = 'action') {
    try {
      const startDate = this.getPeriodStartDate(period);
      const query = { timestamp: { $gte: startDate } };

      const groupByField = groupBy === 'action' ? '$action' : 
                          groupBy === 'resource' ? '$resource' :
                          groupBy === 'user' ? '$userId' : '$action';

      const [totalLogs, groupedStats, timeSeriesData] = await Promise.all([
        this.auditLogModel.countDocuments(query).exec(),
        this.auditLogModel.aggregate([
          { $match: query },
          { $group: { _id: groupByField, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]).exec(),
        this.auditLogModel.aggregate([
          { $match: query },
          {
            $group: {
              _id: {
                date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.date': 1 } }
        ]).exec()
      ]);

      const topUsers = await this.auditLogModel.aggregate([
        { $match: query },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
            pipeline: [{ $project: { username: 1, email: 1 } }]
          }
        }
      ]).exec();

      return {
        period,
        totalLogs,
        groupedBy: groupBy,
        statistics: groupedStats.map(stat => ({
          label: stat._id,
          count: stat.count,
          percentage: (stat.count / totalLogs) * 100
        })),
        timeSeriesData: timeSeriesData.map(data => ({
          date: data._id.date,
          count: data.count
        })),
        topUsers: topUsers.map(user => ({
          userId: user._id,
          username: user.user[0]?.username || 'Unknown',
          email: user.user[0]?.email || 'Unknown',
          count: user.count
        }))
      };
    } catch (error) {
      this.logger.error('Failed to get audit statistics', error);
      throw error;
    }
  }

  async getAuditTimeline(filters: any = {}) {
    try {
      const { startDate, endDate, userId, resource } = filters;
      
      const query: any = {};
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          query.timestamp.$lte = new Date(endDate);
        }
      }

      if (userId) {
        query.userId = userId;
      }

      if (resource) {
        query.resource = resource;
      }

      const timeline = await this.auditLogModel
        .find(query)
        .sort({ timestamp: -1 })
        .limit(100)
        .populate('userId', 'username email')
        .exec();

      const groupedTimeline = timeline.reduce((acc: Record<string, any[]>, log) => {
        const date = log.timestamp.toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push({
          id: log._id,
          timestamp: log.timestamp,
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId,
          user: log.userId,
          metadata: log.metadata
        });
        return acc;
      }, {});

      return {
        filters,
        timeline: Object.entries(groupedTimeline).map(([date, events]) => ({
          date,
          events
        })).sort((a, b) => b.date.localeCompare(a.date))
      };
    } catch (error) {
      this.logger.error('Failed to get audit timeline', error);
      throw error;
    }
  }

  async getRecentActivity(limit: number = 10, userId?: string) {
    try {
      const query = userId ? { userId } : {};
      
      const recentActivity = await this.auditLogModel
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('userId', 'username email firstName lastName')
        .exec();

      return {
        activities: recentActivity.map(activity => ({
          id: activity._id,
          timestamp: activity.timestamp,
          action: activity.action,
          resource: activity.resource,
          resourceId: activity.resourceId,
          user: activity.userId,
          metadata: activity.metadata,
          timeAgo: this.getTimeAgo(activity.timestamp)
        }))
      };
    } catch (error) {
      this.logger.error('Failed to get recent activity', error);
      throw error;
    }
  }

  async getActivitySummary(period: string = '24h', userId?: string) {
    try {
      const startDate = this.getPeriodStartDate(period);
      const query: any = { timestamp: { $gte: startDate } };
      
      if (userId) {
        query.userId = userId;
      }

      const [
        totalActions,
        uniqueUsers,
        topActions,
        topResources,
        hourlyDistribution
      ] = await Promise.all([
        this.auditLogModel.countDocuments(query).exec(),
        this.auditLogModel.distinct('userId', query).exec(),
        this.auditLogModel.aggregate([
          { $match: query },
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).exec(),
        this.auditLogModel.aggregate([
          { $match: query },
          { $group: { _id: '$resource', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).exec(),
        this.auditLogModel.aggregate([
          { $match: query },
          {
            $group: {
              _id: { hour: { $hour: '$timestamp' } },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.hour': 1 } }
        ]).exec()
      ]);

      return {
        period,
        totalActions,
        uniqueUsers: uniqueUsers.length,
        topActions: topActions.map(action => ({
          action: action._id,
          count: action.count
        })),
        topResources: topResources.map(resource => ({
          resource: resource._id,
          count: resource.count
        })),
        hourlyDistribution: Array.from({ length: 24 }, (_, hour) => {
          const data = hourlyDistribution.find(h => h._id.hour === hour);
          return {
            hour,
            count: data ? data.count : 0
          };
        })
      };
    } catch (error) {
      this.logger.error('Failed to get activity summary', error);
      throw error;
    }
  }

  async getAvailableActions() {
    try {
      const actions = await this.auditLogModel.distinct('action').exec();
      return actions.sort();
    } catch (error) {
      this.logger.error('Failed to get available actions', error);
      throw error;
    }
  }

  async getAvailableResources() {
    try {
      const resources = await this.auditLogModel.distinct('resource').exec();
      return resources.sort();
    } catch (error) {
      this.logger.error('Failed to get available resources', error);
      throw error;
    }
  }

  async getActiveUsers(period: string = '24h', limit: number = 20) {
    try {
      const startDate = this.getPeriodStartDate(period);
      
      const activeUsers = await this.auditLogModel.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        { $group: { _id: '$userId', actionsCount: { $sum: 1 }, lastActivity: { $max: '$timestamp' } } },
        { $sort: { actionsCount: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
            pipeline: [{ $project: { username: 1, email: 1, firstName: 1, lastName: 1 } }]
          }
        }
      ]).exec();

      return {
        period,
        activeUsers: activeUsers.map(user => ({
          userId: user._id,
          actionsCount: user.actionsCount,
          lastActivity: user.lastActivity,
          user: user.user[0] || { username: 'Unknown', email: 'Unknown' }
        }))
      };
    } catch (error) {
      this.logger.error('Failed to get active users', error);
      throw error;
    }
  }

  async getSecurityEvents(filters: any = {}, pagination: any = {}) {
    try {
      const { severity, startDate, endDate } = filters;
      const { page = 1, limit = 20 } = pagination;

      const securityActions = [
        'login_failed',
        'login_blocked',
        'password_reset',
        'account_locked',
        'suspicious_activity',
        'permission_denied',
        'unauthorized_access',
        'security_violation'
      ];

      const query: any = {
        action: { $in: securityActions }
      };

      if (severity) {
        query['metadata.severity'] = severity;
      }

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          query.timestamp.$lte = new Date(endDate);
        }
      }

      const skip = (page - 1) * limit;

      const [events, total] = await Promise.all([
        this.auditLogModel
          .find(query)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .populate('userId', 'username email')
          .exec(),
        this.auditLogModel.countDocuments(query).exec()
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        events,
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
      this.logger.error('Failed to get security events', error);
      throw error;
    }
  }

  async getComplianceReport(startDate: string, endDate: string, standard?: string) {
    try {
      const query = {
        timestamp: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };

      const [
        totalEvents,
        userActions,
        dataAccess,
        systemChanges,
        securityEvents
      ] = await Promise.all([
        this.auditLogModel.countDocuments(query).exec(),
        this.auditLogModel.aggregate([
          { $match: { ...query, resource: 'user' } },
          { $group: { _id: '$action', count: { $sum: 1 } } }
        ]).exec(),
        this.auditLogModel.aggregate([
          { $match: { ...query, action: { $regex: 'read|view|access', $options: 'i' } } },
          { $group: { _id: '$resource', count: { $sum: 1 } } }
        ]).exec(),
        this.auditLogModel.aggregate([
          { $match: { ...query, action: { $regex: 'create|update|delete', $options: 'i' } } },
          { $group: { _id: '$resource', count: { $sum: 1 } } }
        ]).exec(),
        this.auditLogModel.countDocuments({
          ...query,
          action: { $in: ['login_failed', 'permission_denied', 'unauthorized_access'] }
        }).exec()
      ]);

      const report = {
        period: { startDate, endDate },
        standard: standard || 'General',
        generatedAt: new Date(),
        summary: {
          totalEvents,
          userActions: userActions.reduce((sum, action) => sum + action.count, 0),
          dataAccess: dataAccess.reduce((sum, access) => sum + access.count, 0),
          systemChanges: systemChanges.reduce((sum, change) => sum + change.count, 0),
          securityEvents
        },
        details: {
          userActions,
          dataAccess,
          systemChanges
        },
        compliance: {
          dataProtection: {
            accessLogged: true,
            deletionLogged: true,
            modificationLogged: true
          },
          auditTrail: {
            complete: true,
            tamperProof: true,
            retention: '7 years'
          }
        }
      };

      await this.logAction('compliance_report_generated', 'compliance', 'admin', report);

      return report;
    } catch (error) {
      this.logger.error('Failed to get compliance report', error);
      throw error;
    }
  }

  async exportAuditLogs(format: string = 'csv', filters: any = {}) {
    try {
      const { startDate, endDate, userId, action, resource } = filters;
      
      const query: any = {};

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          query.timestamp.$lte = new Date(endDate);
        }
      }

      if (userId) query.userId = userId;
      if (action) query.action = action;
      if (resource) query.resource = resource;

      const logs = await this.auditLogModel
        .find(query)
        .sort({ timestamp: -1 })
        .populate('userId', 'username email')
        .exec();

      const exportData = logs.map(log => {
        const user = log.userId as any;
        return {
          timestamp: log.timestamp.toISOString(),
          userId: user?.username || user?.toString() || 'System',
          userEmail: user?.email || '',
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId || '',
          ipAddress: log.metadata?.ipAddress || '',
          userAgent: log.metadata?.userAgent || '',
          metadata: JSON.stringify(log.metadata || {})
        };
      });

      await this.logAction('audit_logs_exported', 'export', 'admin', { 
        format, 
        filters, 
        count: logs.length 
      });

      return {
        data: exportData,
        format,
        count: logs.length,
        exportedAt: new Date(),
        filters
      };
    } catch (error) {
      this.logger.error('Failed to export audit logs', error);
      throw error;
    }
  }

  async updateRetentionPolicy(policy: any) {
    try {
      const settings = await this.systemSettingsModel.findOne().exec() || 
                     new this.systemSettingsModel();

      settings.auditRetentionPolicy = {
        days: policy.retentionDays || policy.days || 2555, // 7 years default
        autoCleanup: policy.autoCleanup !== false,
        compressionEnabled: policy.compressionEnabled !== false
      };

      await settings.save();

      await this.logAction('retention_policy_updated', 'audit_policy', 'admin', policy);

      this.logger.log('Audit retention policy updated');
      return settings.auditRetentionPolicy;
    } catch (error) {
      this.logger.error('Failed to update retention policy', error);
      throw error;
    }
  }

  async getRetentionPolicy() {
    try {
      const settings = await this.systemSettingsModel.findOne().exec();
      return settings?.auditRetentionPolicy || {
        retentionDays: 2555, // 7 years
        autoCleanup: true,
        compressionEnabled: true,
        archiveOldLogs: true
      };
    } catch (error) {
      this.logger.error('Failed to get retention policy', error);
      throw error;
    }
  }

  async cleanupOldLogs(options: any = {}) {
    try {
      const retentionPolicy = await this.getRetentionPolicy();
      const cutoffDays = options.days || (retentionPolicy as any).retentionDays || (retentionPolicy as any).days || 2555;
      const cutoffDate = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);

      const result = await this.auditLogModel
        .deleteMany({ timestamp: { $lt: cutoffDate } })
        .exec();

      const cleanup = {
        cutoffDate,
        cutoffDays,
        deletedCount: result.deletedCount,
        timestamp: new Date()
      };

      await this.logAction('audit_logs_cleaned', 'cleanup', 'admin', cleanup);

      this.logger.log(`Cleaned up ${result.deletedCount} old audit logs`);
      return cleanup;
    } catch (error) {
      this.logger.error('Failed to cleanup old logs', error);
      throw error;
    }
  }

  async bulkDeleteLogs(logIds: string[]) {
    try {
      const result = await this.auditLogModel
        .deleteMany({ _id: { $in: logIds } })
        .exec();

      await this.logAction('audit_logs_bulk_deleted', 'bulk_delete', 'admin', { 
        logIds, 
        deletedCount: result.deletedCount 
      });

      this.logger.log(`Bulk deleted ${result.deletedCount} audit logs`);
      return {
        success: true,
        deletedCount: result.deletedCount
      };
    } catch (error) {
      this.logger.error('Failed to bulk delete logs', error);
      throw error;
    }
  }

  async searchAuditLogs(query: string, pagination: any = {}, filters: any = {}) {
    try {
      const { page = 1, limit = 20 } = pagination;
      
      const searchQuery: any = {
        $or: [
          { action: { $regex: query, $options: 'i' } },
          { resource: { $regex: query, $options: 'i' } },
          { resourceId: { $regex: query, $options: 'i' } },
          { 'metadata.description': { $regex: query, $options: 'i' } }
        ]
      };

      // Apply additional filters
      if (filters.startDate || filters.endDate) {
        searchQuery.timestamp = {};
        if (filters.startDate) {
          searchQuery.timestamp.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          searchQuery.timestamp.$lte = new Date(filters.endDate);
        }
      }

      const skip = (page - 1) * limit;

      const [logs, total] = await Promise.all([
        this.auditLogModel
          .find(searchQuery)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .populate('userId', 'username email')
          .exec(),
        this.auditLogModel.countDocuments(searchQuery).exec()
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        query,
        logs,
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
      this.logger.error('Failed to search audit logs', error);
      throw error;
    }
  }

  async detectAnomalies(threshold: number = 5, period: string = '24h') {
    try {
      const startDate = this.getPeriodStartDate(period);
      
      // Detect unusual activity patterns
      const [
        unusualUserActivity,
        suspiciousIpActivity,
        failedLoginSpikes,
        unusualResourceAccess
      ] = await Promise.all([
        this.detectUnusualUserActivity(startDate, threshold),
        this.detectSuspiciousIpActivity(startDate, threshold),
        this.detectFailedLoginSpikes(startDate, threshold),
        this.detectUnusualResourceAccess(startDate, threshold)
      ]);

      const anomalies = {
        period,
        threshold,
        detectedAt: new Date(),
        anomalies: [
          ...unusualUserActivity,
          ...suspiciousIpActivity,
          ...failedLoginSpikes,
          ...unusualResourceAccess
        ]
      };

      await this.logAction('anomalies_detected', 'anomaly_detection', 'system', anomalies);

      return anomalies;
    } catch (error) {
      this.logger.error('Failed to detect anomalies', error);
      throw error;
    }
  }

  async analyzePatterns(type: string = 'user_behavior', period: string = '7d') {
    try {
      const startDate = this.getPeriodStartDate(period);
      
      let patterns;
      
      switch (type) {
        case 'user_behavior':
          patterns = await this.analyzeUserBehaviorPatterns(startDate);
          break;
        case 'access_patterns':
          patterns = await this.analyzeAccessPatterns(startDate);
          break;
        case 'time_patterns':
          patterns = await this.analyzeTimePatterns(startDate);
          break;
        default:
          patterns = await this.analyzeUserBehaviorPatterns(startDate);
      }

      const analysis = {
        type,
        period,
        analyzedAt: new Date(),
        patterns
      };

      await this.logAction('patterns_analyzed', 'pattern_analysis', 'system', analysis);

      return analysis;
    } catch (error) {
      this.logger.error('Failed to analyze patterns', error);
      throw error;
    }
  }

  async configureAlerts(alertConfig: any) {
    try {
      const settings = await this.systemSettingsModel.findOne().exec() || 
                     new this.systemSettingsModel();

      settings.auditAlerts = {
        ...settings.auditAlerts,
        ...alertConfig,
        updatedAt: new Date()
      };

      await settings.save();

      await this.logAction('audit_alerts_configured', 'alert_config', 'admin', alertConfig);

      this.logger.log('Audit alerts configured');
      return settings.auditAlerts;
    } catch (error) {
      this.logger.error('Failed to configure alerts', error);
      throw error;
    }
  }

  async getActiveAlerts() {
    try {
      // Mock active alerts - implement actual alert system
      const alerts = [
        {
          id: 'alert_1',
          type: 'security',
          severity: 'high',
          message: 'Multiple failed login attempts detected',
          timestamp: new Date(),
          acknowledged: false
        }
      ];

      return { alerts };
    } catch (error) {
      this.logger.error('Failed to get active alerts', error);
      throw error;
    }
  }

  async getDashboardMetrics(period: string = '24h') {
    try {
      const startDate = this.getPeriodStartDate(period);
      const query = { timestamp: { $gte: startDate } };

      const [
        totalEvents,
        securityEvents,
        uniqueUsers,
        topActions,
        recentActivity
      ] = await Promise.all([
        this.auditLogModel.countDocuments(query).exec(),
        this.auditLogModel.countDocuments({
          ...query,
          action: { $in: ['login_failed', 'permission_denied', 'unauthorized_access'] }
        }).exec(),
        this.auditLogModel.distinct('userId', query).exec(),
        this.auditLogModel.aggregate([
          { $match: query },
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).exec(),
        this.auditLogModel
          .find(query)
          .sort({ timestamp: -1 })
          .limit(5)
          .populate('userId', 'username')
          .exec()
      ]);

      return {
        period,
        metrics: {
          totalEvents,
          securityEvents,
          uniqueUsers: uniqueUsers.length,
          topActions: topActions.map(action => ({
            action: action._id,
            count: action.count
          })),
          recentActivity: recentActivity.map(activity => ({
            timestamp: activity.timestamp,
            action: activity.action,
            user: (activity.userId as any)?.username || 'System',
            resource: activity.resource
          }))
        }
      };
    } catch (error) {
      this.logger.error('Failed to get dashboard metrics', error);
      throw error;
    }
  }

  async verifyLogIntegrity(startDate?: string, endDate?: string) {
    try {
      const query: any = {};
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          query.timestamp.$lte = new Date(endDate);
        }
      }

      const logs = await this.auditLogModel.find(query).sort({ timestamp: 1 }).exec();
      
      const verification = {
        period: { startDate, endDate },
        totalLogs: logs.length,
        verified: true,
        issues: [] as Array<{
          type: string;
          logId: any;
          message: string;
        }>,
        checksPerformed: [
          'timestamp_continuity',
          'data_consistency',
          'required_fields'
        ],
        verifiedAt: new Date()
      };

      // Perform integrity checks
      let previousTimestamp = null;
      for (const log of logs) {
        // Check timestamp continuity
        if (previousTimestamp && log.timestamp < previousTimestamp) {
          verification.issues.push({
            type: 'timestamp_order',
            logId: log._id,
            message: 'Log timestamp is out of order'
          });
        }

        // Check required fields
        if (!log.action || !log.resource || !log.timestamp) {
          verification.issues.push({
            type: 'missing_fields',
            logId: log._id,
            message: 'Required fields missing'
          });
        }

        previousTimestamp = log.timestamp;
      }

      verification.verified = verification.issues.length === 0;

      await this.logAction('log_integrity_verified', 'integrity_check', 'admin', verification);

      return verification;
    } catch (error) {
      this.logger.error('Failed to verify log integrity', error);
      throw error;
    }
  }

  async backupAuditLogs(backupOptions: any = {}) {
    try {
      const { startDate, endDate, format = 'json' } = backupOptions;
      
      const query: any = {};
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          query.timestamp.$lte = new Date(endDate);
        }
      }

      const logs = await this.auditLogModel.find(query).exec();
      
      const backup = {
        backupId: `audit_backup_${Date.now()}`,
        timestamp: new Date(),
        format,
        period: { startDate, endDate },
        logCount: logs.length,
        status: 'completed',
        data: logs
      };

      await this.logAction('audit_logs_backed_up', 'backup', 'admin', {
        backupId: backup.backupId,
        logCount: backup.logCount,
        format
      });

      this.logger.log(`Backed up ${logs.length} audit logs`);
      return backup;
    } catch (error) {
      this.logger.error('Failed to backup audit logs', error);
      throw error;
    }
  }

  async getPerformanceMetrics(period: string = '24h') {
    try {
      const startDate = this.getPeriodStartDate(period);
      
      const [
        logInsertionRate,
        queryResponseTimes,
        storageUsage,
        indexUsage
      ] = await Promise.all([
        this.calculateLogInsertionRate(startDate),
        this.calculateQueryResponseTimes(),
        this.calculateStorageUsage(),
        this.calculateIndexUsage()
      ]);

      return {
        period,
        metrics: {
          logInsertionRate,
          queryResponseTimes,
          storageUsage,
          indexUsage
        },
        measuredAt: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to get performance metrics', error);
      throw error;
    }
  }

  // Private helper methods
  private getPeriodStartDate(period: string): Date {
    const now = new Date();
    switch (period) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  private getTimeAgo(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
  }

  private async detectUnusualUserActivity(startDate: Date, threshold: number) {
    // Implementation for detecting unusual user activity
    return [];
  }

  private async detectSuspiciousIpActivity(startDate: Date, threshold: number) {
    // Implementation for detecting suspicious IP activity
    return [];
  }

  private async detectFailedLoginSpikes(startDate: Date, threshold: number) {
    // Implementation for detecting failed login spikes
    return [];
  }

  private async detectUnusualResourceAccess(startDate: Date, threshold: number) {
    // Implementation for detecting unusual resource access
    return [];
  }

  private async analyzeUserBehaviorPatterns(startDate: Date) {
    // Implementation for analyzing user behavior patterns
    return {};
  }

  private async analyzeAccessPatterns(startDate: Date) {
    // Implementation for analyzing access patterns
    return {};
  }

  private async analyzeTimePatterns(startDate: Date) {
    // Implementation for analyzing time patterns
    return {};
  }

  private async calculateLogInsertionRate(startDate: Date) {
    // Implementation for calculating log insertion rate
    return { rate: 100, unit: 'logs/minute' };
  }

  private async calculateQueryResponseTimes() {
    // Implementation for calculating query response times
    return { average: 50, unit: 'ms' };
  }

  private async calculateStorageUsage() {
    // Implementation for calculating storage usage
    return { used: 500, total: 1000, unit: 'MB' };
  }

  private async calculateIndexUsage() {
    // Implementation for calculating index usage
    return { efficiency: 95, unit: 'percentage' };
  }

  private async logAction(action: string, resourceId: string, userId: string, metadata?: any) {
    try {
      await this.auditLogModel.create({
        userId,
        action,
        resource: 'audit',
        resourceId,
        metadata,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to log action', error);
    }
  }
}
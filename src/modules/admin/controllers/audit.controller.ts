import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { AuditService } from '../services/audit.service';
import { JwtAuthGuard } from '../../../guards/jwt-auth.guard';
import { RolesGuard } from '../../../guards/roles.guard';
import { Roles } from '../../../decorators/roles.decorator';

@Controller('admin/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'admin')
export class AuditController {
  private readonly logger = new Logger(AuditController.name);

  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  async getAuditLogs(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sortBy') sortBy: string = 'timestamp',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc'
  ) {
    try {
      const filters = { userId, action, resource, startDate, endDate };
      const pagination = { page: Number(page), limit: Number(limit) };
      const sorting = { sortBy, sortOrder };

      return await this.auditService.getAuditLogs(filters, pagination, sorting);
    } catch (error) {
      this.logger.error('Failed to get audit logs', error);
      throw error;
    }
  }

  @Get('logs/:id')
  async getAuditLogById(@Param('id') id: string) {
    try {
      return await this.auditService.getAuditLogById(id);
    } catch (error) {
      this.logger.error(`Failed to get audit log ${id}`, error);
      throw error;
    }
  }

  @Get('statistics')
  async getAuditStatistics(
    @Query('period') period: string = '30d',
    @Query('groupBy') groupBy: string = 'action'
  ) {
    try {
      return await this.auditService.getAuditStatistics(period, groupBy);
    } catch (error) {
      this.logger.error('Failed to get audit statistics', error);
      throw error;
    }
  }

  @Get('timeline')
  async getAuditTimeline(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
    @Query('resource') resource?: string
  ) {
    try {
      const filters = { startDate, endDate, userId, resource };
      return await this.auditService.getAuditTimeline(filters);
    } catch (error) {
      this.logger.error('Failed to get audit timeline', error);
      throw error;
    }
  }

  @Get('activity/recent')
  async getRecentActivity(
    @Query('limit') limit: number = 10,
    @Query('userId') userId?: string
  ) {
    try {
      return await this.auditService.getRecentActivity(Number(limit), userId);
    } catch (error) {
      this.logger.error('Failed to get recent activity', error);
      throw error;
    }
  }

  @Get('activity/summary')
  async getActivitySummary(
    @Query('period') period: string = '24h',
    @Query('userId') userId?: string
  ) {
    try {
      return await this.auditService.getActivitySummary(period, userId);
    } catch (error) {
      this.logger.error('Failed to get activity summary', error);
      throw error;
    }
  }

  @Get('actions')
  async getAvailableActions() {
    try {
      return await this.auditService.getAvailableActions();
    } catch (error) {
      this.logger.error('Failed to get available actions', error);
      throw error;
    }
  }

  @Get('resources')
  async getAvailableResources() {
    try {
      return await this.auditService.getAvailableResources();
    } catch (error) {
      this.logger.error('Failed to get available resources', error);
      throw error;
    }
  }

  @Get('users/active')
  async getActiveUsers(
    @Query('period') period: string = '24h',
    @Query('limit') limit: number = 20
  ) {
    try {
      return await this.auditService.getActiveUsers(period, Number(limit));
    } catch (error) {
      this.logger.error('Failed to get active users', error);
      throw error;
    }
  }

  @Get('security/events')
  async getSecurityEvents(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('severity') severity?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    try {
      const filters = { severity, startDate, endDate };
      const pagination = { page: Number(page), limit: Number(limit) };

      return await this.auditService.getSecurityEvents(filters, pagination);
    } catch (error) {
      this.logger.error('Failed to get security events', error);
      throw error;
    }
  }

  @Get('compliance/report')
  async getComplianceReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('standard') standard?: string
  ) {
    try {
      return await this.auditService.getComplianceReport(startDate, endDate, standard);
    } catch (error) {
      this.logger.error('Failed to get compliance report', error);
      throw error;
    }
  }

  @Get('export')
  async exportAuditLogs(
    @Query('format') format: string = 'csv',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string
  ) {
    try {
      const filters = { startDate, endDate, userId, action, resource };
      return await this.auditService.exportAuditLogs(format, filters);
    } catch (error) {
      this.logger.error('Failed to export audit logs', error);
      throw error;
    }
  }

  @Post('retention/policy')
  @HttpCode(HttpStatus.OK)
  async updateRetentionPolicy(@Body() policy: any) {
    try {
      return await this.auditService.updateRetentionPolicy(policy);
    } catch (error) {
      this.logger.error('Failed to update retention policy', error);
      throw error;
    }
  }

  @Get('retention/policy')
  async getRetentionPolicy() {
    try {
      return await this.auditService.getRetentionPolicy();
    } catch (error) {
      this.logger.error('Failed to get retention policy', error);
      throw error;
    }
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  async cleanupOldLogs(@Body() options: any) {
    try {
      return await this.auditService.cleanupOldLogs(options);
    } catch (error) {
      this.logger.error('Failed to cleanup old logs', error);
      throw error;
    }
  }

  @Delete('logs/bulk')
  @HttpCode(HttpStatus.OK)
  async bulkDeleteLogs(@Body() logIds: string[]) {
    try {
      return await this.auditService.bulkDeleteLogs(logIds);
    } catch (error) {
      this.logger.error('Failed to bulk delete logs', error);
      throw error;
    }
  }

  @Get('search')
  async searchAuditLogs(
    @Query('query') query: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('filters') filters?: string
  ) {
    try {
      const pagination = { page: Number(page), limit: Number(limit) };
      const searchFilters = filters ? JSON.parse(filters) : {};

      return await this.auditService.searchAuditLogs(query, pagination, searchFilters);
    } catch (error) {
      this.logger.error('Failed to search audit logs', error);
      throw error;
    }
  }

  @Get('anomalies')
  async getAnomalies(
    @Query('threshold') threshold: number = 5,
    @Query('period') period: string = '24h'
  ) {
    try {
      return await this.auditService.detectAnomalies(Number(threshold), period);
    } catch (error) {
      this.logger.error('Failed to get anomalies', error);
      throw error;
    }
  }

  @Get('patterns')
  async getPatterns(
    @Query('type') type: string = 'user_behavior',
    @Query('period') period: string = '7d'
  ) {
    try {
      return await this.auditService.analyzePatterns(type, period);
    } catch (error) {
      this.logger.error('Failed to get patterns', error);
      throw error;
    }
  }

  @Post('alerts/configure')
  @HttpCode(HttpStatus.OK)
  async configureAlerts(@Body() alertConfig: any) {
    try {
      return await this.auditService.configureAlerts(alertConfig);
    } catch (error) {
      this.logger.error('Failed to configure alerts', error);
      throw error;
    }
  }

  @Get('alerts/active')
  async getActiveAlerts() {
    try {
      return await this.auditService.getActiveAlerts();
    } catch (error) {
      this.logger.error('Failed to get active alerts', error);
      throw error;
    }
  }

  @Get('dashboard/metrics')
  async getDashboardMetrics(@Query('period') period: string = '24h') {
    try {
      return await this.auditService.getDashboardMetrics(period);
    } catch (error) {
      this.logger.error('Failed to get dashboard metrics', error);
      throw error;
    }
  }

  @Get('integrity/verify')
  async verifyLogIntegrity(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    try {
      return await this.auditService.verifyLogIntegrity(startDate, endDate);
    } catch (error) {
      this.logger.error('Failed to verify log integrity', error);
      throw error;
    }
  }

  @Post('backup')
  @HttpCode(HttpStatus.OK)
  async backupAuditLogs(@Body() backupOptions: any) {
    try {
      return await this.auditService.backupAuditLogs(backupOptions);
    } catch (error) {
      this.logger.error('Failed to backup audit logs', error);
      throw error;
    }
  }

  @Get('performance/metrics')
  async getPerformanceMetrics(@Query('period') period: string = '24h') {
    try {
      return await this.auditService.getPerformanceMetrics(period);
    } catch (error) {
      this.logger.error('Failed to get performance metrics', error);
      throw error;
    }
  }
}
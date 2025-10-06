import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  Logger,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from '../services/admin.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get admin dashboard overview' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  @UseInterceptors(CacheInterceptor)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async getDashboard() {
    return this.adminService.getDashboardOverview();
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get system statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @UseInterceptors(CacheInterceptor)
  @Throttle({ default: { limit: 50, ttl: 60000 } })
  async getStatistics() {
    return this.adminService.getSystemStatistics();
  }

  @Get('health')
  @ApiOperation({ summary: 'Check system health' })
  @ApiResponse({ status: 200, description: 'Health status retrieved successfully' })
  @Throttle({ default: { limit: 200, ttl: 60000 } })
  async getHealthStatus() {
    return this.adminService.getHealthStatus();
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get system alerts' })
  @ApiResponse({ status: 200, description: 'Alerts retrieved successfully' })
  async getAlerts(@Query() filters: any) {
    return this.adminService.getAlerts(filters);
  }

  @Get('performance-metrics')
  @ApiOperation({ summary: 'Get performance metrics' })
  @ApiResponse({ status: 200, description: 'Performance metrics retrieved successfully' })
  @UseInterceptors(CacheInterceptor)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getPerformanceMetrics() {
    return this.adminService.getPerformanceMetrics();
  }

  @Post('maintenance-mode')
  @ApiOperation({ summary: 'Toggle maintenance mode' })
  @ApiResponse({ status: 200, description: 'Maintenance mode toggled successfully' })
  async toggleMaintenanceMode(@Body() data: { enabled: boolean; message?: string }) {
    return this.adminService.toggleMaintenanceMode(data.enabled, data.message);
  }

  @Post('backup')
  @ApiOperation({ summary: 'Create system backup' })
  @ApiResponse({ status: 200, description: 'Backup created successfully' })
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 per hour
  async createBackup(@Body() options: any) {
    return this.adminService.createBackup(options);
  }

  @Get('backups')
  @ApiOperation({ summary: 'List system backups' })
  @ApiResponse({ status: 200, description: 'Backups retrieved successfully' })
  async listBackups() {
    return this.adminService.listBackups();
  }

  @Post('restore/:backupId')
  @ApiOperation({ summary: 'Restore from backup' })
  @ApiResponse({ status: 200, description: 'System restored successfully' })
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 per hour
  async restoreBackup(@Param('backupId') backupId: string) {
    return this.adminService.restoreFromBackup(backupId);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get system logs' })
  @ApiResponse({ status: 200, description: 'Logs retrieved successfully' })
  async getLogs(@Query() filters: any) {
    return this.adminService.getLogs(filters);
  }

  @Delete('logs')
  @ApiOperation({ summary: 'Clear system logs' })
  @ApiResponse({ status: 200, description: 'Logs cleared successfully' })
  async clearLogs(@Body() criteria: any) {
    return this.adminService.clearLogs(criteria);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Generate admin reports' })
  @ApiResponse({ status: 200, description: 'Reports generated successfully' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async generateReports(@Query() reportType: string, @Query() filters: any) {
    return this.adminService.generateReports(reportType, filters);
  }
}
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  UseGuards,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { SystemService } from '../services/system.service';
import { JwtAuthGuard } from '../../../guards/jwt-auth.guard';
import { RolesGuard } from '../../../guards/roles.guard';
import { Roles } from '../../../decorators/roles.decorator';

@Controller('admin/system')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class SystemController {
  private readonly logger = new Logger(SystemController.name);

  constructor(private readonly systemService: SystemService) {}

  @Get('health')
  async getSystemHealth() {
    try {
      return await this.systemService.getSystemHealth();
    } catch (error) {
      this.logger.error('Failed to get system health', error);
      throw error;
    }
  }

  @Get('status')
  async getSystemStatus() {
    try {
      return await this.systemService.getSystemStatus();
    } catch (error) {
      this.logger.error('Failed to get system status', error);
      throw error;
    }
  }

  @Get('metrics')
  async getSystemMetrics() {
    try {
      return await this.systemService.getSystemMetrics();
    } catch (error) {
      this.logger.error('Failed to get system metrics', error);
      throw error;
    }
  }

  @Get('settings')
  async getSystemSettings() {
    try {
      return await this.systemService.getSystemSettings();
    } catch (error) {
      this.logger.error('Failed to get system settings', error);
      throw error;
    }
  }

  @Put('settings')
  async updateSystemSettings(@Body(ValidationPipe) settings: any) {
    try {
      return await this.systemService.updateSystemSettings(settings);
    } catch (error) {
      this.logger.error('Failed to update system settings', error);
      throw error;
    }
  }

  @Get('logs')
  async getSystemLogs(
    @Query('level') level?: string,
    @Query('source') source?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50
  ) {
    try {
      const filters = { level, source, startDate, endDate };
      const pagination = { page: Number(page), limit: Number(limit) };
      
      return await this.systemService.getSystemLogs(filters, pagination);
    } catch (error) {
      this.logger.error('Failed to get system logs', error);
      throw error;
    }
  }

  @Post('backup')
  @HttpCode(HttpStatus.OK)
  async createBackup(@Body() backupOptions: any) {
    try {
      return await this.systemService.createBackup(backupOptions);
    } catch (error) {
      this.logger.error('Failed to create backup', error);
      throw error;
    }
  }

  @Get('backups')
  async getBackups(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ) {
    try {
      const pagination = { page: Number(page), limit: Number(limit) };
      return await this.systemService.getBackups(pagination);
    } catch (error) {
      this.logger.error('Failed to get backups', error);
      throw error;
    }
  }

  @Post('restore')
  @HttpCode(HttpStatus.OK)
  async restoreBackup(@Body() restoreOptions: any) {
    try {
      return await this.systemService.restoreBackup(restoreOptions);
    } catch (error) {
      this.logger.error('Failed to restore backup', error);
      throw error;
    }
  }

  @Post('maintenance/enable')
  @HttpCode(HttpStatus.OK)
  async enableMaintenanceMode(@Body() options: any) {
    try {
      return await this.systemService.enableMaintenanceMode(options);
    } catch (error) {
      this.logger.error('Failed to enable maintenance mode', error);
      throw error;
    }
  }

  @Post('maintenance/disable')
  @HttpCode(HttpStatus.OK)
  async disableMaintenanceMode() {
    try {
      return await this.systemService.disableMaintenanceMode();
    } catch (error) {
      this.logger.error('Failed to disable maintenance mode', error);
      throw error;
    }
  }

  @Get('maintenance/status')
  async getMaintenanceStatus() {
    try {
      return await this.systemService.getMaintenanceStatus();
    } catch (error) {
      this.logger.error('Failed to get maintenance status', error);
      throw error;
    }
  }

  @Post('cache/clear')
  @HttpCode(HttpStatus.OK)
  async clearCache(@Body() cacheOptions: any) {
    try {
      return await this.systemService.clearCache(cacheOptions);
    } catch (error) {
      this.logger.error('Failed to clear cache', error);
      throw error;
    }
  }

  @Get('cache/status')
  async getCacheStatus() {
    try {
      return await this.systemService.getCacheStatus();
    } catch (error) {
      this.logger.error('Failed to get cache status', error);
      throw error;
    }
  }

  @Get('database/status')
  async getDatabaseStatus() {
    try {
      return await this.systemService.getDatabaseStatus();
    } catch (error) {
      this.logger.error('Failed to get database status', error);
      throw error;
    }
  }

  @Post('database/optimize')
  @HttpCode(HttpStatus.OK)
  async optimizeDatabase() {
    try {
      return await this.systemService.optimizeDatabase();
    } catch (error) {
      this.logger.error('Failed to optimize database', error);
      throw error;
    }
  }

  @Get('security/scan')
  async performSecurityScan() {
    try {
      return await this.systemService.performSecurityScan();
    } catch (error) {
      this.logger.error('Failed to perform security scan', error);
      throw error;
    }
  }

  @Get('security/threats')
  async getSecurityThreats(
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ) {
    try {
      const filters = { severity, status };
      const pagination = { page: Number(page), limit: Number(limit) };
      
      return await this.systemService.getSecurityThreats(filters, pagination);
    } catch (error) {
      this.logger.error('Failed to get security threats', error);
      throw error;
    }
  }

  @Post('notifications/send')
  @HttpCode(HttpStatus.OK)
  async sendSystemNotification(@Body() notification: any) {
    try {
      return await this.systemService.sendSystemNotification(notification);
    } catch (error) {
      this.logger.error('Failed to send system notification', error);
      throw error;
    }
  }

  @Get('resources/usage')
  async getResourceUsage() {
    try {
      return await this.systemService.getResourceUsage();
    } catch (error) {
      this.logger.error('Failed to get resource usage', error);
      throw error;
    }
  }

  @Get('version')
  async getSystemVersion() {
    try {
      return await this.systemService.getSystemVersion();
    } catch (error) {
      this.logger.error('Failed to get system version', error);
      throw error;
    }
  }

  @Post('update/check')
  @HttpCode(HttpStatus.OK)
  async checkForUpdates() {
    try {
      return await this.systemService.checkForUpdates();
    } catch (error) {
      this.logger.error('Failed to check for updates', error);
      throw error;
    }
  }

  @Post('cleanup/temp')
  @HttpCode(HttpStatus.OK)
  async cleanupTempFiles() {
    try {
      return await this.systemService.cleanupTempFiles();
    } catch (error) {
      this.logger.error('Failed to cleanup temp files', error);
      throw error;
    }
  }

  @Post('cleanup/logs')
  @HttpCode(HttpStatus.OK)
  async cleanupOldLogs(@Body() options: any) {
    try {
      return await this.systemService.cleanupOldLogs(options);
    } catch (error) {
      this.logger.error('Failed to cleanup old logs', error);
      throw error;
    }
  }

  @Get('services/status')
  async getServicesStatus() {
    try {
      return await this.systemService.getServicesStatus();
    } catch (error) {
      this.logger.error('Failed to get services status', error);
      throw error;
    }
  }

  @Post('services/:serviceName/restart')
  @HttpCode(HttpStatus.OK)
  async restartService(@Body() serviceName: string) {
    try {
      return await this.systemService.restartService(serviceName);
    } catch (error) {
      this.logger.error(`Failed to restart service ${serviceName}`, error);
      throw error;
    }
  }

  @Get('environment')
  async getEnvironmentInfo() {
    try {
      return await this.systemService.getEnvironmentInfo();
    } catch (error) {
      this.logger.error('Failed to get environment info', error);
      throw error;
    }
  }

  @Get('configurations')
  async getSystemConfigurations() {
    try {
      return await this.systemService.getSystemConfigurations();
    } catch (error) {
      this.logger.error('Failed to get system configurations', error);
      throw error;
    }
  }

  @Put('configurations')
  async updateSystemConfigurations(@Body(ValidationPipe) configurations: any) {
    try {
      return await this.systemService.updateSystemConfigurations(configurations);
    } catch (error) {
      this.logger.error('Failed to update system configurations', error);
      throw error;
    }
  }
}
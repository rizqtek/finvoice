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
  ValidationPipe,
  HttpCode,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { PermissionsService } from '../services/permissions.service';
import { JwtAuthGuard } from '../../../guards/jwt-auth.guard';
import { RolesGuard } from '../../../guards/roles.guard';
import { Roles } from '../../../decorators/roles.decorator';
import { CreatePermissionDto, UpdatePermissionDto, BulkPermissionOperationDto } from '../dto/permissions.dto';

@Controller('admin/permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'admin')
export class PermissionsController {
  private readonly logger = new Logger(PermissionsController.name);

  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  async getPermissions(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('resource') resource?: string,
    @Query('category') category?: string,
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc'
  ) {
    try {
      const filters = { search, resource, category };
      const pagination = { page: Number(page), limit: Number(limit) };
      const sorting = { sortBy, sortOrder };

      return await this.permissionsService.getPermissions(filters, pagination, sorting);
    } catch (error) {
      this.logger.error('Failed to get permissions', error);
      throw error;
    }
  }

  @Get('grouped')
  async getGroupedPermissions() {
    try {
      return await this.permissionsService.getGroupedPermissions();
    } catch (error) {
      this.logger.error('Failed to get grouped permissions', error);
      throw error;
    }
  }

  @Get('resources')
  async getPermissionResources() {
    try {
      return await this.permissionsService.getPermissionResources();
    } catch (error) {
      this.logger.error('Failed to get permission resources', error);
      throw error;
    }
  }

  @Get('categories')
  async getPermissionCategories() {
    try {
      return await this.permissionsService.getPermissionCategories();
    } catch (error) {
      this.logger.error('Failed to get permission categories', error);
      throw error;
    }
  }

  @Get(':id')
  async getPermissionById(@Param('id') id: string) {
    try {
      return await this.permissionsService.getPermissionById(id);
    } catch (error) {
      this.logger.error(`Failed to get permission ${id}`, error);
      throw error;
    }
  }

  @Get(':id/roles')
  async getPermissionRoles(
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ) {
    try {
      const pagination = { page: Number(page), limit: Number(limit) };
      return await this.permissionsService.getPermissionRoles(id, pagination);
    } catch (error) {
      this.logger.error(`Failed to get roles for permission ${id}`, error);
      throw error;
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPermission(@Body(ValidationPipe) createPermissionDto: CreatePermissionDto) {
    try {
      return await this.permissionsService.createPermission(createPermissionDto);
    } catch (error) {
      this.logger.error('Failed to create permission', error);
      throw error;
    }
  }

  @Put(':id')
  async updatePermission(
    @Param('id') id: string,
    @Body(ValidationPipe) updatePermissionDto: UpdatePermissionDto
  ) {
    try {
      return await this.permissionsService.updatePermission(id, updatePermissionDto);
    } catch (error) {
      this.logger.error(`Failed to update permission ${id}`, error);
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePermission(@Param('id') id: string) {
    try {
      return await this.permissionsService.deletePermission(id);
    } catch (error) {
      this.logger.error(`Failed to delete permission ${id}`, error);
      throw error;
    }
  }

  @Post('bulk-create')
  @HttpCode(HttpStatus.CREATED)
  async bulkCreatePermissions(@Body() permissions: CreatePermissionDto[]) {
    try {
      return await this.permissionsService.bulkCreatePermissions(permissions);
    } catch (error) {
      this.logger.error('Failed to bulk create permissions', error);
      throw error;
    }
  }

  @Post('bulk-update')
  @HttpCode(HttpStatus.OK)
  async bulkUpdatePermissions(@Body(ValidationPipe) bulkOperationDto: BulkPermissionOperationDto) {
    try {
      return await this.permissionsService.bulkUpdatePermissions(
        bulkOperationDto.permissionIds,
        bulkOperationDto.updates
      );
    } catch (error) {
      this.logger.error('Failed to bulk update permissions', error);
      throw error;
    }
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  async bulkDeletePermissions(@Body() permissionIds: string[]) {
    try {
      return await this.permissionsService.bulkDeletePermissions(permissionIds);
    } catch (error) {
      this.logger.error('Failed to bulk delete permissions', error);
      throw error;
    }
  }

  @Post('sync-system')
  @HttpCode(HttpStatus.OK)
  async syncSystemPermissions() {
    try {
      return await this.permissionsService.syncSystemPermissions();
    } catch (error) {
      this.logger.error('Failed to sync system permissions', error);
      throw error;
    }
  }

  @Get('check/:resource/:action')
  async checkPermission(
    @Param('resource') resource: string,
    @Param('action') action: string
  ) {
    try {
      return await this.permissionsService.checkPermissionExists(resource, action);
    } catch (error) {
      this.logger.error(`Failed to check permission ${resource}:${action}`, error);
      throw error;
    }
  }

  @Post(':id/clone')
  @HttpCode(HttpStatus.CREATED)
  async clonePermission(
    @Param('id') id: string,
    @Body() cloneData: { name: string; description?: string }
  ) {
    try {
      return await this.permissionsService.clonePermission(id, cloneData.name, cloneData.description);
    } catch (error) {
      this.logger.error(`Failed to clone permission ${id}`, error);
      throw error;
    }
  }

  @Get('statistics/overview')
  async getPermissionStatistics() {
    try {
      return await this.permissionsService.getPermissionStatistics();
    } catch (error) {
      this.logger.error('Failed to get permission statistics', error);
      throw error;
    }
  }

  @Get('export/csv')
  async exportPermissions(@Query('format') format: string = 'csv') {
    try {
      return await this.permissionsService.exportPermissions(format);
    } catch (error) {
      this.logger.error('Failed to export permissions', error);
      throw error;
    }
  }

  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  async importPermissions(@Body() importData: any) {
    try {
      return await this.permissionsService.importPermissions(importData);
    } catch (error) {
      this.logger.error('Failed to import permissions', error);
      throw error;
    }
  }

  @Get(':id/audit-trail')
  async getPermissionAuditTrail(
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ) {
    try {
      const pagination = { page: Number(page), limit: Number(limit) };
      return await this.permissionsService.getPermissionAuditTrail(id, pagination);
    } catch (error) {
      this.logger.error(`Failed to get audit trail for permission ${id}`, error);
      throw error;
    }
  }

  @Post(':id/validate')
  @HttpCode(HttpStatus.OK)
  async validatePermission(@Param('id') id: string) {
    try {
      return await this.permissionsService.validatePermission(id);
    } catch (error) {
      this.logger.error(`Failed to validate permission ${id}`, error);
      throw error;
    }
  }

  @Post('validate-matrix')
  @HttpCode(HttpStatus.OK)
  async validatePermissionMatrix(@Body() matrix: any) {
    try {
      return await this.permissionsService.validatePermissionMatrix(matrix);
    } catch (error) {
      this.logger.error('Failed to validate permission matrix', error);
      throw error;
    }
  }

  @Get('matrix/generate')
  async generatePermissionMatrix() {
    try {
      return await this.permissionsService.generatePermissionMatrix();
    } catch (error) {
      this.logger.error('Failed to generate permission matrix', error);
      throw error;
    }
  }

  @Post('cleanup/orphaned')
  @HttpCode(HttpStatus.OK)
  async cleanupOrphanedPermissions() {
    try {
      return await this.permissionsService.cleanupOrphanedPermissions();
    } catch (error) {
      this.logger.error('Failed to cleanup orphaned permissions', error);
      throw error;
    }
  }
}
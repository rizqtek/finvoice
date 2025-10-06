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
import { RolesService } from '../services/roles.service';
import { JwtAuthGuard } from '../../../guards/jwt-auth.guard';
import { RolesGuard } from '../../../guards/roles.guard';
import { Roles } from '../../../decorators/roles.decorator';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto, BulkRoleOperationDto } from '../dto/roles.dto';

@Controller('admin/roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'admin')
export class RolesController {
  private readonly logger = new Logger(RolesController.name);

  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async getRoles(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc'
  ) {
    try {
      const filters = { search, status };
      const pagination = { page: Number(page), limit: Number(limit) };
      const sorting = { sortBy, sortOrder };

      return await this.rolesService.getRoles(filters, pagination, sorting);
    } catch (error) {
      this.logger.error('Failed to get roles', error);
      throw error;
    }
  }

  @Get(':id')
  async getRoleById(@Param('id') id: string) {
    try {
      return await this.rolesService.getRoleById(id);
    } catch (error) {
      this.logger.error(`Failed to get role ${id}`, error);
      throw error;
    }
  }

  @Get(':id/permissions')
  async getRolePermissions(@Param('id') id: string) {
    try {
      return await this.rolesService.getRolePermissions(id);
    } catch (error) {
      this.logger.error(`Failed to get permissions for role ${id}`, error);
      throw error;
    }
  }

  @Get(':id/users')
  async getRoleUsers(
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ) {
    try {
      const pagination = { page: Number(page), limit: Number(limit) };
      return await this.rolesService.getRoleUsers(id, pagination);
    } catch (error) {
      this.logger.error(`Failed to get users for role ${id}`, error);
      throw error;
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRole(@Body(ValidationPipe) createRoleDto: CreateRoleDto) {
    try {
      return await this.rolesService.createRole(createRoleDto);
    } catch (error) {
      this.logger.error('Failed to create role', error);
      throw error;
    }
  }

  @Put(':id')
  async updateRole(
    @Param('id') id: string,
    @Body(ValidationPipe) updateRoleDto: UpdateRoleDto
  ) {
    try {
      return await this.rolesService.updateRole(id, updateRoleDto);
    } catch (error) {
      this.logger.error(`Failed to update role ${id}`, error);
      throw error;
    }
  }

  @Put(':id/permissions')
  async assignPermissions(
    @Param('id') id: string,
    @Body(ValidationPipe) assignPermissionsDto: AssignPermissionsDto
  ) {
    try {
      return await this.rolesService.assignPermissions(id, assignPermissionsDto.permissionIds);
    } catch (error) {
      this.logger.error(`Failed to assign permissions to role ${id}`, error);
      throw error;
    }
  }

  @Delete(':id/permissions/:permissionId')
  async removePermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string
  ) {
    try {
      return await this.rolesService.removePermission(id, permissionId);
    } catch (error) {
      this.logger.error(`Failed to remove permission ${permissionId} from role ${id}`, error);
      throw error;
    }
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activateRole(@Param('id') id: string) {
    try {
      return await this.rolesService.activateRole(id);
    } catch (error) {
      this.logger.error(`Failed to activate role ${id}`, error);
      throw error;
    }
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivateRole(@Param('id') id: string) {
    try {
      return await this.rolesService.deactivateRole(id);
    } catch (error) {
      this.logger.error(`Failed to deactivate role ${id}`, error);
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRole(@Param('id') id: string) {
    try {
      return await this.rolesService.deleteRole(id);
    } catch (error) {
      this.logger.error(`Failed to delete role ${id}`, error);
      throw error;
    }
  }

  @Post('bulk-create')
  @HttpCode(HttpStatus.CREATED)
  async bulkCreateRoles(@Body() roles: CreateRoleDto[]) {
    try {
      return await this.rolesService.bulkCreateRoles(roles);
    } catch (error) {
      this.logger.error('Failed to bulk create roles', error);
      throw error;
    }
  }

  @Post('bulk-update')
  @HttpCode(HttpStatus.OK)
  async bulkUpdateRoles(@Body(ValidationPipe) bulkOperationDto: BulkRoleOperationDto) {
    try {
      return await this.rolesService.bulkUpdateRoles(bulkOperationDto.roleIds, bulkOperationDto.updates);
    } catch (error) {
      this.logger.error('Failed to bulk update roles', error);
      throw error;
    }
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  async bulkDeleteRoles(@Body() roleIds: string[]) {
    try {
      return await this.rolesService.bulkDeleteRoles(roleIds);
    } catch (error) {
      this.logger.error('Failed to bulk delete roles', error);
      throw error;
    }
  }

  @Post('bulk-activate')
  @HttpCode(HttpStatus.OK)
  async bulkActivateRoles(@Body() roleIds: string[]) {
    try {
      return await this.rolesService.bulkActivateRoles(roleIds);
    } catch (error) {
      this.logger.error('Failed to bulk activate roles', error);
      throw error;
    }
  }

  @Post('bulk-deactivate')
  @HttpCode(HttpStatus.OK)
  async bulkDeactivateRoles(@Body() roleIds: string[]) {
    try {
      return await this.rolesService.bulkDeactivateRoles(roleIds);
    } catch (error) {
      this.logger.error('Failed to bulk deactivate roles', error);
      throw error;
    }
  }

  @Get('hierarchy/tree')
  async getRoleHierarchy() {
    try {
      return await this.rolesService.getRoleHierarchy();
    } catch (error) {
      this.logger.error('Failed to get role hierarchy', error);
      throw error;
    }
  }

  @Post(':id/clone')
  @HttpCode(HttpStatus.CREATED)
  async cloneRole(
    @Param('id') id: string,
    @Body() cloneData: { name: string; description?: string }
  ) {
    try {
      return await this.rolesService.cloneRole(id, cloneData.name, cloneData.description);
    } catch (error) {
      this.logger.error(`Failed to clone role ${id}`, error);
      throw error;
    }
  }

  @Get('statistics/overview')
  async getRoleStatistics() {
    try {
      return await this.rolesService.getRoleStatistics();
    } catch (error) {
      this.logger.error('Failed to get role statistics', error);
      throw error;
    }
  }

  @Get('export/csv')
  async exportRoles(@Query('format') format: string = 'csv') {
    try {
      return await this.rolesService.exportRoles(format);
    } catch (error) {
      this.logger.error('Failed to export roles', error);
      throw error;
    }
  }

  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  async importRoles(@Body() importData: any) {
    try {
      return await this.rolesService.importRoles(importData);
    } catch (error) {
      this.logger.error('Failed to import roles', error);
      throw error;
    }
  }

  @Get(':id/audit-trail')
  async getRoleAuditTrail(
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ) {
    try {
      const pagination = { page: Number(page), limit: Number(limit) };
      return await this.rolesService.getRoleAuditTrail(id, pagination);
    } catch (error) {
      this.logger.error(`Failed to get audit trail for role ${id}`, error);
      throw error;
    }
  }

  @Post(':id/validate')
  @HttpCode(HttpStatus.OK)
  async validateRole(@Param('id') id: string) {
    try {
      return await this.rolesService.validateRole(id);
    } catch (error) {
      this.logger.error(`Failed to validate role ${id}`, error);
      throw error;
    }
  }
}
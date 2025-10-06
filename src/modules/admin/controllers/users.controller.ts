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
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { UserProfileService } from '../services/user-profile.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';

@ApiTags('Users Management')
@Controller('admin/users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly userProfileService: UserProfileService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all users with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @UseInterceptors(CacheInterceptor)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async getAllUsers(@Query() query: any) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  @Post()
  @ApiOperation({ summary: 'Create new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid user data' })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async createUser(@Body() userData: any) {
    return this.usersService.create(userData);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(@Param('id') id: string, @Body() updateData: any) {
    return this.usersService.update(id, updateData);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(@Param('id') id: string) {
    return this.usersService.delete(id);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate user account' })
  @ApiResponse({ status: 200, description: 'User activated successfully' })
  async activateUser(@Param('id') id: string) {
    return this.usersService.activate(id);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate user account' })
  @ApiResponse({ status: 200, description: 'User deactivated successfully' })
  async deactivateUser(@Param('id') id: string, @Body() reason?: any) {
    return this.usersService.deactivate(id, reason?.reason);
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: 'Reset user password' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async resetPassword(@Param('id') id: string, @Body() data: { newPassword?: string; sendEmail?: boolean }) {
    return this.usersService.resetPassword(id, data.newPassword, data.sendEmail);
  }

  @Post(':id/unlock')
  @ApiOperation({ summary: 'Unlock user account' })
  @ApiResponse({ status: 200, description: 'Account unlocked successfully' })
  async unlockAccount(@Param('id') id: string) {
    return this.usersService.unlockAccount(id);
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  async getUserProfile(@Param('id') id: string) {
    return this.userProfileService.getProfile(id);
  }

  @Put(':id/profile')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateUserProfile(@Param('id') id: string, @Body() profileData: any) {
    return this.userProfileService.updateProfile(id, profileData);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Get user activity history' })
  @ApiResponse({ status: 200, description: 'Activity retrieved successfully' })
  @UseInterceptors(CacheInterceptor)
  async getUserActivity(@Param('id') id: string, @Query() filters: any) {
    return this.usersService.getActivity(id, filters);
  }

  @Get(':id/sessions')
  @ApiOperation({ summary: 'Get user active sessions' })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully' })
  async getUserSessions(@Param('id') id: string) {
    return this.usersService.getSessions(id);
  }

  @Delete(':id/sessions/:sessionId')
  @ApiOperation({ summary: 'Terminate user session' })
  @ApiResponse({ status: 200, description: 'Session terminated successfully' })
  async terminateSession(@Param('id') id: string, @Param('sessionId') sessionId: string) {
    return this.usersService.terminateSession(id, sessionId);
  }

  @Post(':id/roles')
  @ApiOperation({ summary: 'Assign roles to user' })
  @ApiResponse({ status: 200, description: 'Roles assigned successfully' })
  async assignRoles(@Param('id') id: string, @Body() data: { roles: string[] }) {
    return this.usersService.assignRoles(id, data.roles);
  }

  @Delete(':id/roles/:roleId')
  @ApiOperation({ summary: 'Remove role from user' })
  @ApiResponse({ status: 200, description: 'Role removed successfully' })
  async removeRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.usersService.removeRole(id, roleId);
  }

  @Post(':id/permissions')
  @ApiOperation({ summary: 'Grant permissions to user' })
  @ApiResponse({ status: 200, description: 'Permissions granted successfully' })
  async grantPermissions(@Param('id') id: string, @Body() data: { permissions: string[] }) {
    return this.usersService.grantPermissions(id, data.permissions);
  }

  @Delete(':id/permissions/:permissionId')
  @ApiOperation({ summary: 'Revoke permission from user' })
  @ApiResponse({ status: 200, description: 'Permission revoked successfully' })
  async revokePermission(@Param('id') id: string, @Param('permissionId') permissionId: string) {
    return this.usersService.revokePermission(id, permissionId);
  }

  @Post(':id/2fa/enable')
  @ApiOperation({ summary: 'Enable two-factor authentication' })
  @ApiResponse({ status: 200, description: '2FA enabled successfully' })
  async enableTwoFactor(@Param('id') id: string) {
    return this.usersService.enableTwoFactor(id);
  }

  @Post(':id/2fa/disable')
  @ApiOperation({ summary: 'Disable two-factor authentication' })
  @ApiResponse({ status: 200, description: '2FA disabled successfully' })
  async disableTwoFactor(@Param('id') id: string) {
    return this.usersService.disableTwoFactor(id);
  }

  @Post('bulk-action')
  @ApiOperation({ summary: 'Perform bulk actions on users' })
  @ApiResponse({ status: 200, description: 'Bulk action completed successfully' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async bulkAction(@Body() data: { action: string; userIds: string[]; options?: any }) {
    return this.usersService.bulkAction(data.action, data.userIds, data.options);
  }

  @Get('export/:format')
  @ApiOperation({ summary: 'Export users data' })
  @ApiResponse({ status: 200, description: 'Export completed successfully' })
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 per 5 minutes
  async exportUsers(@Param('format') format: string, @Query() filters: any) {
    if (!['csv', 'excel', 'json'].includes(format)) {
      throw new BadRequestException('Invalid export format');
    }
    return this.usersService.exportUsers(format, filters);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import users from file' })
  @ApiResponse({ status: 200, description: 'Import completed successfully' })
  @Throttle({ default: { limit: 2, ttl: 300000 } }) // 2 per 5 minutes
  async importUsers(@Body() data: any) {
    return this.usersService.importUsers(data);
  }
}
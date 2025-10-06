import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './controllers/admin.controller';
import { UsersController } from './controllers/users.controller';
import { RolesController } from './controllers/roles.controller';
import { PermissionsController } from './controllers/permissions.controller';
import { SystemController } from './controllers/system.controller';
import { AuditController } from './controllers/audit.controller';
import { AdminService } from './services/admin.service';
import { UsersService } from './services/users.service';
import { RolesService } from './services/roles.service';
import { PermissionsService } from './services/permissions.service';
import { SystemService } from './services/system.service';
import { AuditService } from './services/audit.service';
import { UserProfileService } from './services/user-profile.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { Role, RoleSchema } from './schemas/role.schema';
import { Permission, PermissionSchema } from './schemas/permission.schema';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { UserProfile, UserProfileSchema } from './schemas/user-profile.schema';
import { SystemSettings, SystemSettingsSchema } from './schemas/system-settings.schema';
import { JwtModule } from '@nestjs/jwt';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    CacheModule.register({}),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Permission.name, schema: PermissionSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: UserProfile.name, schema: UserProfileSchema },
      { name: SystemSettings.name, schema: SystemSettingsSchema },
    ]),
  ],
  controllers: [
    AdminController,
    UsersController,
    RolesController,
    PermissionsController,
    SystemController,
    AuditController,
  ],
  providers: [
    AdminService,
    UsersService,
    RolesService,
    PermissionsService,
    SystemService,
    AuditService,
    UserProfileService,
  ],
  exports: [
    AdminService,
    UsersService,
    RolesService,
    PermissionsService,
    SystemService,
    AuditService,
    UserProfileService,
  ],
})
export class AdminModule {}
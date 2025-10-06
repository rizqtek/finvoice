import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, IsEnum } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  permissions?: string[];

  @IsOptional()
  @IsBoolean()
  isSystemRole?: boolean;

  @IsOptional()
  @IsNumber()
  level?: number;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  permissions?: string[];

  @IsOptional()
  @IsBoolean()
  isSystemRole?: boolean;

  @IsOptional()
  @IsNumber()
  level?: number;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class AssignPermissionsDto {
  @IsArray()
  permissionIds: string[];
}

export class BulkRoleOperationDto {
  @IsArray()
  roleIds: string[];

  @IsOptional()
  updates?: Partial<UpdateRoleDto>;
}
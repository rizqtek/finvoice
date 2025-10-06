import { IsString, IsNumber, IsEnum, IsDateString, IsArray, IsOptional, ValidateNested, Min, IsUUID } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceType, InvoiceFrequency, InvoiceStatus } from '../../domain/enums/invoice.enums';

export class CreateInvoiceItemDto {
  @ApiProperty({ example: 'Web Development Services' })
  @IsString()
  description: string;

  @ApiProperty({ example: 40 })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ example: 125.50 })
  @IsNumber()
  @Min(0.01)
  unitPrice: number;

  @ApiPropertyOptional({ example: 0.08 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;
}

export class CreateInvoiceDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  clientId: string;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439012' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439013' })
  @IsString()
  issuedBy: string;

  @ApiProperty({ enum: InvoiceType, example: InvoiceType.STANDARD })
  @IsEnum(InvoiceType)
  type: InvoiceType;

  @ApiProperty({ example: 'USD' })
  @IsString()
  currency: string;

  @ApiProperty({ example: '2025-11-06T00:00:00.000Z' })
  @IsDateString()
  @Transform(({ value }) => new Date(value))
  dueDate: Date;

  @ApiPropertyOptional({ enum: InvoiceFrequency })
  @IsOptional()
  @IsEnum(InvoiceFrequency)
  frequency?: InvoiceFrequency;

  @ApiPropertyOptional({ example: 'Payment terms: Net 30 days' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [CreateInvoiceItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items?: CreateInvoiceItemDto[];
}

export class UpdateInvoiceDto {
  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439012' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: '2025-11-06T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => new Date(value))
  dueDate?: Date;

  @ApiPropertyOptional({ enum: InvoiceFrequency })
  @IsOptional()
  @IsEnum(InvoiceFrequency)
  frequency?: InvoiceFrequency;

  @ApiPropertyOptional({ example: 'Updated payment terms' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [CreateInvoiceItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items?: CreateInvoiceItemDto[];
}

export class ListInvoicesQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439013' })
  @IsOptional()
  @IsString()
  issuedBy?: string;
}

export class InvoiceItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  unitPrice: {
    amount: number;
    currency: string;
  };

  @ApiPropertyOptional()
  taxRate?: {
    rate: number;
    type: string;
  };

  @ApiProperty()
  total: {
    amount: number;
    currency: string;
  };
}

export class InvoiceTotalsResponseDto {
  @ApiProperty()
  subtotal: {
    amount: number;
    currency: string;
  };

  @ApiProperty()
  totalTax: {
    amount: number;
    currency: string;
  };

  @ApiProperty()
  total: {
    amount: number;
    currency: string;
  };
}

export class InvoiceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  number: string;

  @ApiProperty()
  clientId: string;

  @ApiPropertyOptional()
  projectId?: string;

  @ApiProperty()
  issuedBy: string;

  @ApiProperty({ enum: InvoiceType })
  type: InvoiceType;

  @ApiProperty({ enum: InvoiceStatus })
  status: InvoiceStatus;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  dueDate: Date;

  @ApiPropertyOptional({ enum: InvoiceFrequency })
  frequency?: InvoiceFrequency;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty({ type: [InvoiceItemResponseDto] })
  items: InvoiceItemResponseDto[];

  @ApiProperty({ type: InvoiceTotalsResponseDto })
  totals: InvoiceTotalsResponseDto;

  @ApiPropertyOptional()
  finalizedAt?: Date;

  @ApiPropertyOptional()
  sentAt?: Date;

  @ApiPropertyOptional()
  paidAt?: Date;

  @ApiPropertyOptional()
  voidedAt?: Date;

  @ApiPropertyOptional()
  paidAmount?: {
    amount: number;
    currency: string;
  };

  @ApiPropertyOptional()
  voidReason?: string;
}
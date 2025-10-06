import { IsString, IsNotEmpty, IsNumber, IsDateString, IsOptional, ValidateNested, IsArray, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TaxRateDto {
  @ApiProperty({ description: 'Tax rate as decimal (0.1 for 10%)', minimum: 0, maximum: 1 })
  @IsNumber({}, { message: 'Tax rate must be a number' })
  @Min(0, { message: 'Tax rate cannot be negative' })
  rate: number;

  @ApiProperty({ description: 'Tax rate name', example: 'VAT' })
  @IsString({ message: 'Tax rate name must be a string' })
  @IsNotEmpty({ message: 'Tax rate name cannot be empty' })
  name: string;
}

export class LineItemDto {
  @ApiProperty({ description: 'Item description', example: 'Web Development Services' })
  @IsString({ message: 'Description must be a string' })
  @IsNotEmpty({ message: 'Description cannot be empty' })
  description: string;

  @ApiProperty({ description: 'Quantity', example: 1, minimum: 1 })
  @IsNumber({}, { message: 'Quantity must be a number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;

  @ApiProperty({ description: 'Unit price', example: 1000, minimum: 0 })
  @IsNumber({}, { message: 'Unit price must be a number' })
  @Min(0, { message: 'Unit price cannot be negative' })
  unitPrice: number;

  @ApiProperty({ description: 'Currency code', example: 'USD' })
  @IsString({ message: 'Currency must be a string' })
  @IsIn(['USD', 'EUR', 'GBP', 'INR'], { message: 'Currency must be one of: USD, EUR, GBP, INR' })
  currency: string;

  @ApiPropertyOptional({ description: 'Tax rate for this line item', type: TaxRateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TaxRateDto)
  taxRate?: TaxRateDto;
}

export class CreateInvoiceDto {
  @ApiProperty({ description: 'Client ID', example: 'client_123' })
  @IsString({ message: 'Client ID must be a string' })
  @IsNotEmpty({ message: 'Client ID cannot be empty' })
  clientId: string;

  @ApiProperty({ description: 'Invoice number', example: 'INV-2024-001' })
  @IsString({ message: 'Invoice number must be a string' })
  @IsNotEmpty({ message: 'Invoice number cannot be empty' })
  invoiceNumber: string;

  @ApiProperty({ description: 'Issue date', example: '2024-01-15' })
  @IsDateString({}, { message: 'Issue date must be a valid date' })
  issueDate: string;

  @ApiProperty({ description: 'Due date', example: '2024-02-15' })
  @IsDateString({}, { message: 'Due date must be a valid date' })
  dueDate: string;

  @ApiProperty({ description: 'Invoice line items', type: [LineItemDto] })
  @IsArray({ message: 'Line items must be an array' })
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems: LineItemDto[];

  @ApiPropertyOptional({ description: 'Additional notes', example: 'Payment due within 30 days' })
  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  notes?: string;
}

export class SendInvoiceDto {
  @ApiProperty({ description: 'Client email address', example: 'client@example.com' })
  @IsString({ message: 'Email must be a string' })
  @IsNotEmpty({ message: 'Email cannot be empty' })
  email: string;
}

export class MarkInvoicePaidDto {
  @ApiProperty({ description: 'Paid amount', example: 1080.00 })
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(0, { message: 'Amount cannot be negative' })
  amount: number;

  @ApiProperty({ description: 'Currency code', example: 'USD' })
  @IsString({ message: 'Currency must be a string' })
  @IsIn(['USD', 'EUR', 'GBP', 'INR'], { message: 'Currency must be one of: USD, EUR, GBP, INR' })
  currency: string;

  @ApiProperty({ description: 'Payment method', example: 'stripe' })
  @IsString({ message: 'Payment method must be a string' })
  @IsNotEmpty({ message: 'Payment method cannot be empty' })
  paymentMethod: string;
}
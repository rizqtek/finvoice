import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { CreateInvoiceUseCase } from '../../application/use-cases/create-invoice-new.usecase';
import { GetInvoiceUseCase } from '../../application/use-cases/get-invoice.usecase';
import { ListInvoicesUseCase } from '../../application/use-cases/list-invoices.usecase';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  ListInvoicesQueryDto,
  InvoiceResponseDto,
} from '../../application/dto/invoice.dto';

@ApiTags('Invoices')
@Controller('invoices')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InvoicesController {
  constructor(
    private readonly createInvoiceUseCase: CreateInvoiceUseCase,
    private readonly getInvoiceUseCase: GetInvoiceUseCase,
    private readonly listInvoicesUseCase: ListInvoicesUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new invoice' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Invoice created successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            number: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Invoice number already exists',
  })
  async createInvoice(
    @Body() createInvoiceDto: CreateInvoiceDto,
    @Request() req: any,
  ): Promise<{
    success: boolean;
    data: { id: string; number: string };
  }> {
    // Use authenticated user as issuedBy if not provided
    const command = {
      ...createInvoiceDto,
      issuedBy: createInvoiceDto.issuedBy || req.user._id.toString(),
    };

    const result = await this.createInvoiceUseCase.execute(command);

    return {
      success: true,
      data: result,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List invoices with pagination and filters' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoices retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            invoices: {
              type: 'array',
              items: { $ref: '#/components/schemas/InvoiceResponseDto' },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                pages: { type: 'number' },
              },
            },
          },
        },
      },
    },
  })
  async listInvoices(@Query() query: ListInvoicesQueryDto): Promise<{
    success: boolean;
    data: {
      invoices: any[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    };
  }> {
    const result = await this.listInvoicesUseCase.execute(query);

    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoice retrieved successfully',
    type: InvoiceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Invoice not found',
  })
  async getInvoice(@Param('id') id: string): Promise<{
    success: boolean;
    data: any;
  }> {
    const invoice = await this.getInvoiceUseCase.execute(id);

    return {
      success: true,
      data: invoice,
    };
  }

  @Get('number/:number')
  @ApiOperation({ summary: 'Get invoice by number' })
  @ApiParam({ name: 'number', description: 'Invoice number (e.g., INV-001234)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoice retrieved successfully',
    type: InvoiceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Invoice not found',
  })
  async getInvoiceByNumber(@Param('number') number: string): Promise<{
    success: boolean;
    data: any;
  }> {
    const invoice = await this.getInvoiceUseCase.getByNumber(number);

    return {
      success: true,
      data: invoice,
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update invoice (draft only)' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoice updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Invoice not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Cannot update finalized invoice',
  })
  async updateInvoice(
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    // TODO: Implement update use case
    return {
      success: true,
      message: 'Invoice update functionality will be implemented',
    };
  }

  @Post(':id/finalize')
  @ApiOperation({ summary: 'Finalize invoice (make it immutable)' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoice finalized successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Invoice not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invoice already finalized or has no items',
  })
  async finalizeInvoice(@Param('id') id: string): Promise<{
    success: boolean;
    message: string;
  }> {
    // TODO: Implement finalize use case
    return {
      success: true,
      message: 'Invoice finalize functionality will be implemented',
    };
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send invoice to client' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoice sent successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Invoice not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invoice must be finalized before sending',
  })
  async sendInvoice(@Param('id') id: string): Promise<{
    success: boolean;
    message: string;
  }> {
    // TODO: Implement send use case
    return {
      success: true,
      message: 'Invoice send functionality will be implemented',
    };
  }

  @Post(':id/void')
  @ApiOperation({ summary: 'Void invoice' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoice voided successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Invoice not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Cannot void paid invoice',
  })
  async voidInvoice(
    @Param('id') id: string,
    @Body() body: { reason: string },
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    // TODO: Implement void use case
    return {
      success: true,
      message: 'Invoice void functionality will be implemented',
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete invoice (draft only)' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoice deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Invoice not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Cannot delete finalized invoice',
  })
  async deleteInvoice(@Param('id') id: string): Promise<{
    success: boolean;
    message: string;
  }> {
    // TODO: Implement delete use case
    return {
      success: true,
      message: 'Invoice delete functionality will be implemented',
    };
  }
}
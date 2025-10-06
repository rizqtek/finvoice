import { Controller, Post, Get, Put, Delete, Body, Param, Query, HttpStatus, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CreateInvoiceUseCase } from '../../application/use-cases/create-invoice.usecase';
import { UpdateInvoiceUseCase } from '../../application/use-cases/update-invoice.usecase';
import { GetInvoiceUseCase } from '../../application/use-cases/get-invoice.usecase';
import { DeleteInvoiceUseCase } from '../../application/use-cases/delete-invoice.usecase';
import { ListInvoicesUseCase } from '../../application/use-cases/list-invoices.usecase';
import { SendInvoiceUseCase } from '../../application/use-cases/send-invoice.usecase';
import { CreateInvoiceDto, UpdateInvoiceDto, InvoiceResponseDto, ListInvoicesQueryDto } from '../../application/dto/invoice.dto';
import { MongoInvoiceRepository } from '../../infrastructure/repositories/mongo-invoice.repository';
import { BullMQService } from '@shared/infrastructure/jobs/bullmq.service';

@ApiTags('invoices')
@Controller('api/invoices')
export class InvoicesController {
  constructor(
    private readonly createInvoiceUseCase: CreateInvoiceUseCase,
    private readonly updateInvoiceUseCase: UpdateInvoiceUseCase,
    private readonly getInvoiceUseCase: GetInvoiceUseCase,
    private readonly deleteInvoiceUseCase: DeleteInvoiceUseCase,
    private readonly listInvoicesUseCase: ListInvoicesUseCase,
    private readonly sendInvoiceUseCase: SendInvoiceUseCase,
    private readonly invoiceRepository: MongoInvoiceRepository,
    private readonly jobService: BullMQService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new invoice' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Invoice created successfully', type: InvoiceResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Invoice number already exists' })
  async createInvoice(@Body() createInvoiceDto: CreateInvoiceDto): Promise<InvoiceResponseDto> {
    try {
      // Generate invoice number if not provided
      const invoiceNumber = createInvoiceDto.invoiceNumber || `INV-${Date.now()}`;
      
      // Check if invoice number already exists
      const existingInvoice = await this.invoiceRepository.findByInvoiceNumber(invoiceNumber);
      if (existingInvoice) {
        throw new BadRequestException(`Invoice number ${invoiceNumber} already exists`);
      }

      // Calculate line item totals
      const lineItems = createInvoiceDto.lineItems.map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: {
          amount: item.unitPrice,
          currency: item.currency || 'USD',
        },
        total: {
          amount: item.quantity * item.unitPrice,
          currency: item.currency || 'USD',
        },
      }));

      const subtotalAmount = lineItems.reduce((sum: number, item: any) => sum + item.total.amount, 0);

      const invoiceData = {
        invoiceNumber,
        customerId: createInvoiceDto.customerId,
        issueDate: new Date(createInvoiceDto.issueDate),
        dueDate: new Date(createInvoiceDto.dueDate),
        status: 'draft',
        lineItems,
        taxLines: [],
        subtotal: {
          amount: subtotalAmount,
          currency: lineItems[0]?.total.currency || 'USD',
        },
        totalAmount: {
          amount: subtotalAmount,
          currency: lineItems[0]?.total.currency || 'USD',
        },
        notes: createInvoiceDto.notes,
        terms: createInvoiceDto.terms,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.invoiceRepository.save(invoiceData);
      
      const savedInvoice = await this.invoiceRepository.findByInvoiceNumber(invoiceNumber);
      return this.mapToResponseDto(savedInvoice);
      
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to create invoice');
    }
  }

  @Get()
  @ApiOperation({ summary: 'List invoices with filtering and pagination' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Invoices retrieved successfully', type: [InvoiceResponseDto] })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by invoice status' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items per page' })
  async listInvoices(@Query() query: ListInvoicesQueryDto): Promise<{
    invoices: InvoiceResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.listInvoicesUseCase.execute(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Invoice retrieved successfully', type: InvoiceResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Invoice not found' })
  async getInvoice(@Param('id') id: string): Promise<InvoiceResponseDto> {
    return this.getInvoiceUseCase.execute(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing invoice' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Invoice updated successfully', type: InvoiceResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Invoice not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data or invoice cannot be updated' })
  async updateInvoice(
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
  ): Promise<InvoiceResponseDto> {
    return this.updateInvoiceUseCase.execute(id, updateInvoiceDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an invoice' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Invoice deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Invoice not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invoice cannot be deleted' })
  async deleteInvoice(@Param('id') id: string): Promise<void> {
    return this.deleteInvoiceUseCase.execute(id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send an invoice to customer' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Invoice sent successfully', type: InvoiceResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Invoice not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invoice cannot be sent' })
  async sendInvoice(@Param('id') id: string): Promise<InvoiceResponseDto> {
    return this.sendInvoiceUseCase.execute(id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download invoice PDF' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'PDF generated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Invoice not found' })
  async downloadInvoicePdf(@Param('id') id: string): Promise<{ downloadUrl: string }> {
    const invoice = await this.invoiceRepository.findById(id);
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    // Queue PDF generation job
    await this.jobService.addJob('invoice-processing', 'generate-pdf', {
      invoiceId: id,
      action: 'generate-pdf',
    });

    return {
      downloadUrl: `/api/invoices/${id}/pdf/download`
    };
  }

  @Get('status/overdue')
  @ApiOperation({ summary: 'Get overdue invoices' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Overdue invoices retrieved successfully', type: [InvoiceResponseDto] })
  async getOverdueInvoices(): Promise<InvoiceResponseDto[]> {
    const result = await this.listInvoicesUseCase.execute({ status: 'overdue' });
    return result.invoices;
  }

  private mapToResponseDto(invoice: any): InvoiceResponseDto {
    return {
      id: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId.toString(),
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      lineItems: invoice.lineItems,
      subtotal: invoice.subtotal.amount,
      totalAmount: invoice.totalAmount.amount,
      currency: invoice.totalAmount.currency,
      notes: invoice.notes,
      terms: invoice.terms,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
  }
}
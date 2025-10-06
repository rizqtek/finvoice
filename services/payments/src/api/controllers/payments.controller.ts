import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpStatus, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MongoPaymentRepository } from '../../infrastructure/repositories/mongo-payment.repository';
import { BullMQService } from '@shared/infrastructure/jobs/bullmq.service';

export class CreatePaymentDto {
  paymentId: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  currency: string;
  method: string;
  notes?: string;
}

export class PaymentResponseDto {
  id: string;
  paymentId: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  gatewayTransactionId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

@ApiTags('payments')
@Controller('api/payments')
export class PaymentsController {
  constructor(
    private readonly paymentRepository: MongoPaymentRepository,
    private readonly jobService: BullMQService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new payment' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Payment created successfully', type: PaymentResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data' })
  async createPayment(@Body() createPaymentDto: CreatePaymentDto): Promise<PaymentResponseDto> {
    const paymentData = {
      paymentId: createPaymentDto.paymentId,
      invoiceId: createPaymentDto.invoiceId,
      customerId: createPaymentDto.customerId,
      amount: {
        amount: createPaymentDto.amount,
        currency: createPaymentDto.currency,
      },
      status: 'pending',
      method: createPaymentDto.method,
      notes: createPaymentDto.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.paymentRepository.save(paymentData);

    // Queue payment processing job
    await this.jobService.addJob('payment-processing', 'process-payment', {
      paymentId: createPaymentDto.paymentId,
      action: 'process',
    });

    const payment = await this.paymentRepository.findByPaymentId(createPaymentDto.paymentId);
    return this.mapToResponseDto(payment);
  }

  @Get()
  @ApiOperation({ summary: 'List payments with filtering' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payments retrieved successfully', type: [PaymentResponseDto] })
  @ApiQuery({ name: 'invoiceId', required: false, description: 'Filter by invoice ID' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by payment status' })
  async listPayments(
    @Query('invoiceId') invoiceId?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ): Promise<PaymentResponseDto[]> {
    let payments: any[] = [];

    if (invoiceId) {
      payments = await this.paymentRepository.findByInvoiceId(invoiceId);
    } else if (customerId) {
      payments = await this.paymentRepository.findByCustomerId(customerId);
    } else {
      // For demo purposes, return empty array
      // In a real implementation, you'd add a findAll method
      payments = [];
    }

    // Apply status filter if provided
    if (status) {
      payments = payments.filter((payment: any) => payment.status === status);
    }

    return payments.map((payment: any) => this.mapToResponseDto(payment));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment by ID' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payment retrieved successfully', type: PaymentResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Payment not found' })
  async getPayment(@Param('id') id: string): Promise<PaymentResponseDto> {
    const payment = await this.paymentRepository.findById(id);
    
    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    return this.mapToResponseDto(payment);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update payment status' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payment status updated successfully', type: PaymentResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Payment not found' })
  async updatePaymentStatus(
    @Param('id') id: string,
    @Body() updateDto: { status: string; gatewayTransactionId?: string; failureReason?: string },
  ): Promise<PaymentResponseDto> {
    const payment = await this.paymentRepository.findById(id);
    
    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    const updateData: any = {
      _id: payment._id,
      status: updateDto.status,
      updatedAt: new Date(),
    };

    if (updateDto.gatewayTransactionId) {
      updateData.gatewayTransactionId = updateDto.gatewayTransactionId;
    }

    if (updateDto.status === 'completed') {
      updateData.processedAt = new Date();
    } else if (updateDto.status === 'failed') {
      updateData.failedAt = new Date();
      updateData.failureReason = updateDto.failureReason;
    }

    await this.paymentRepository.save(updateData);

    const updatedPayment = await this.paymentRepository.findById(id);
    return this.mapToResponseDto(updatedPayment);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a payment' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Payment deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Payment not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Payment cannot be deleted' })
  async deletePayment(@Param('id') id: string): Promise<void> {
    const payment = await this.paymentRepository.findById(id);
    
    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    // Check if payment can be deleted (only pending and failed payments can be deleted)
    if (payment.status === 'completed' || payment.status === 'processing') {
      throw new BadRequestException(`Cannot delete payment with status: ${payment.status}`);
    }

    await this.paymentRepository.delete(id);
  }

  @Get('invoice/:invoiceId')
  @ApiOperation({ summary: 'Get payments for a specific invoice' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Payments retrieved successfully', type: [PaymentResponseDto] })
  async getPaymentsByInvoice(@Param('invoiceId') invoiceId: string): Promise<PaymentResponseDto[]> {
    const payments = await this.paymentRepository.findByInvoiceId(invoiceId);
    return payments.map((payment: any) => this.mapToResponseDto(payment));
  }

  private mapToResponseDto(payment: any): PaymentResponseDto {
    return {
      id: payment._id.toString(),
      paymentId: payment.paymentId,
      invoiceId: payment.invoiceId.toString(),
      customerId: payment.customerId.toString(),
      amount: payment.amount.amount,
      currency: payment.amount.currency,
      status: payment.status,
      method: payment.method,
      gatewayTransactionId: payment.gatewayTransactionId,
      notes: payment.notes,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
export interface PaymentRepository {
  save(payment: any): Promise<void>;
  findById(id: string): Promise<any | null>;
  findByPaymentId(paymentId: string): Promise<any | null>;
  findByInvoiceId(invoiceId: string): Promise<any[]>;
  findByCustomerId(customerId: string): Promise<any[]>;
  findByGatewayTransactionId(transactionId: string): Promise<any | null>;
  delete(id: string): Promise<void>;
}
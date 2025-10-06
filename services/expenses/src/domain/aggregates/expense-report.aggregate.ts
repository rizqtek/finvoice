import { AggregateRoot, DomainException } from '@shared/kernel';
import { ExpenseStatus, ExpenseCategory } from '../value-objects/enums';
import { ReceiptUploadedEvent, ExpenseSubmittedEvent, ExpenseApprovedEvent, ExpenseRejectedEvent } from '../events/expense-events';

interface ReceiptProps {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
  ocrData?: {
    amount?: number;
    currency?: string;
    date?: Date;
    vendor?: string;
    extractedText?: string;
    confidence?: number;
  };
}

export class Receipt {
  constructor(
    public readonly fileName: string,
    public readonly fileUrl: string,
    public readonly fileSize: number,
    public readonly mimeType: string,
    public readonly uploadedAt: Date,
    public readonly ocrData?: ReceiptProps['ocrData']
  ) {
    if (!fileName || fileName.trim().length === 0) {
      throw new DomainException('Receipt file name cannot be empty');
    }
    if (!fileUrl || fileUrl.trim().length === 0) {
      throw new DomainException('Receipt file URL cannot be empty');
    }
    if (fileSize <= 0) {
      throw new DomainException('Receipt file size must be positive');
    }
    if (!this.isValidMimeType(mimeType)) {
      throw new DomainException('Invalid receipt file type');
    }
  }

  private isValidMimeType(mimeType: string): boolean {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf'
    ];
    return allowedTypes.includes(mimeType);
  }

  hasOcrData(): boolean {
    return !!this.ocrData;
  }

  getConfidenceLevel(): number {
    return this.ocrData?.confidence || 0;
  }
}

interface ExpenseReportProps {
  employeeId: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  expenseDate: Date;
  status: ExpenseStatus;
  receipt?: Receipt;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  approvedAmount?: number;
  rejectionReason?: string;
  notes?: string;
  projectId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ExpenseReportAggregate extends AggregateRoot {
  private constructor(
    private props: ExpenseReportProps,
    id?: string
  ) {
    super(id);
  }

  static create(
    employeeId: string,
    title: string,
    description: string,
    amount: number,
    currency: string,
    category: ExpenseCategory,
    expenseDate: Date,
    projectId?: string,
    notes?: string
  ): ExpenseReportAggregate {
    if (!employeeId || employeeId.trim().length === 0) {
      throw new DomainException('Employee ID cannot be empty');
    }
    if (!title || title.trim().length === 0) {
      throw new DomainException('Expense title cannot be empty');
    }
    if (amount <= 0) {
      throw new DomainException('Expense amount must be positive');
    }
    if (!currency || currency.length !== 3) {
      throw new DomainException('Currency must be a valid 3-letter code');
    }
    if (expenseDate > new Date()) {
      throw new DomainException('Expense date cannot be in the future');
    }

    const now = new Date();
    return new ExpenseReportAggregate({
      employeeId: employeeId.trim(),
      title: title.trim(),
      description: description.trim(),
      amount,
      currency: currency.toUpperCase(),
      category,
      expenseDate,
      status: ExpenseStatus.DRAFT,
      projectId: projectId?.trim(),
      notes: notes?.trim(),
      createdAt: now,
      updatedAt: now
    });
  }

  static fromPersistence(props: ExpenseReportProps, id: string): ExpenseReportAggregate {
    return new ExpenseReportAggregate(props, id);
  }

  // Getters
  get employeeId(): string {
    return this.props.employeeId;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string {
    return this.props.description;
  }

  get amount(): number {
    return this.props.amount;
  }

  get currency(): string {
    return this.props.currency;
  }

  get category(): ExpenseCategory {
    return this.props.category;
  }

  get expenseDate(): Date {
    return this.props.expenseDate;
  }

  get status(): ExpenseStatus {
    return this.props.status;
  }

  get receipt(): Receipt | undefined {
    return this.props.receipt;
  }

  get submittedAt(): Date | undefined {
    return this.props.submittedAt;
  }

  get reviewedAt(): Date | undefined {
    return this.props.reviewedAt;
  }

  get reviewedBy(): string | undefined {
    return this.props.reviewedBy;
  }

  get approvedAmount(): number | undefined {
    return this.props.approvedAmount;
  }

  get rejectionReason(): string | undefined {
    return this.props.rejectionReason;
  }

  get notes(): string | undefined {
    return this.props.notes;
  }

  get projectId(): string | undefined {
    return this.props.projectId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // Business methods
  attachReceipt(
    fileName: string,
    fileUrl: string,
    fileSize: number,
    mimeType: string,
    ocrData?: Receipt['ocrData']
  ): void {
    if (this.props.status !== ExpenseStatus.DRAFT) {
      throw new DomainException('Can only attach receipt to draft expenses');
    }

    this.props.receipt = new Receipt(
      fileName,
      fileUrl,
      fileSize,
      mimeType,
      new Date(),
      ocrData
    );
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new ReceiptUploadedEvent(this.id, fileName, fileSize, mimeType)
    );
  }

  updateFromOcr(ocrData: Receipt['ocrData']): void {
    if (!this.props.receipt) {
      throw new DomainException('Cannot update OCR data without a receipt');
    }

    // Update expense details based on OCR data if they seem more accurate
    if (ocrData?.amount && ocrData.amount > 0 && ocrData.confidence && ocrData.confidence > 0.8) {
      this.props.amount = ocrData.amount;
    }
    if (ocrData?.currency && ocrData.currency.length === 3) {
      this.props.currency = ocrData.currency.toUpperCase();
    }
    if (ocrData?.date && ocrData.date <= new Date()) {
      this.props.expenseDate = ocrData.date;
    }

    // Create new receipt with OCR data
    this.props.receipt = new Receipt(
      this.props.receipt.fileName,
      this.props.receipt.fileUrl,
      this.props.receipt.fileSize,
      this.props.receipt.mimeType,
      this.props.receipt.uploadedAt,
      ocrData
    );
    
    this.props.updatedAt = new Date();
  }

  submit(): void {
    if (this.props.status !== ExpenseStatus.DRAFT) {
      throw new DomainException('Only draft expenses can be submitted');
    }
    if (!this.props.receipt) {
      throw new DomainException('Cannot submit expense without receipt');
    }

    this.props.status = ExpenseStatus.SUBMITTED;
    this.props.submittedAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new ExpenseSubmittedEvent(
        this.id,
        this.props.employeeId,
        this.props.amount,
        this.props.currency
      )
    );
  }

  startReview(reviewerId: string): void {
    if (this.props.status !== ExpenseStatus.SUBMITTED) {
      throw new DomainException('Only submitted expenses can be reviewed');
    }
    if (!reviewerId || reviewerId.trim().length === 0) {
      throw new DomainException('Reviewer ID cannot be empty');
    }

    this.props.status = ExpenseStatus.UNDER_REVIEW;
    this.props.reviewedBy = reviewerId.trim();
    this.props.updatedAt = new Date();
  }

  approve(reviewerId: string, approvedAmount?: number, notes?: string): void {
    if (this.props.status !== ExpenseStatus.UNDER_REVIEW) {
      throw new DomainException('Only expenses under review can be approved');
    }
    if (!reviewerId || reviewerId.trim().length === 0) {
      throw new DomainException('Reviewer ID cannot be empty');
    }

    const finalAmount = approvedAmount || this.props.amount;
    if (finalAmount <= 0) {
      throw new DomainException('Approved amount must be positive');
    }
    if (finalAmount > this.props.amount) {
      throw new DomainException('Approved amount cannot exceed requested amount');
    }

    this.props.status = ExpenseStatus.APPROVED;
    this.props.reviewedBy = reviewerId.trim();
    this.props.reviewedAt = new Date();
    this.props.approvedAmount = finalAmount;
    this.props.notes = notes?.trim();
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new ExpenseApprovedEvent(
        this.id,
        reviewerId,
        finalAmount,
        notes
      )
    );
  }

  reject(reviewerId: string, reason: string): void {
    if (this.props.status !== ExpenseStatus.UNDER_REVIEW) {
      throw new DomainException('Only expenses under review can be rejected');
    }
    if (!reviewerId || reviewerId.trim().length === 0) {
      throw new DomainException('Reviewer ID cannot be empty');
    }
    if (!reason || reason.trim().length === 0) {
      throw new DomainException('Rejection reason cannot be empty');
    }

    this.props.status = ExpenseStatus.REJECTED;
    this.props.reviewedBy = reviewerId.trim();
    this.props.reviewedAt = new Date();
    this.props.rejectionReason = reason.trim();
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new ExpenseRejectedEvent(this.id, reviewerId, reason)
    );
  }

  markAsPaid(): void {
    if (this.props.status !== ExpenseStatus.APPROVED) {
      throw new DomainException('Only approved expenses can be marked as paid');
    }

    this.props.status = ExpenseStatus.PAID;
    this.props.updatedAt = new Date();
  }

  updateDetails(
    title?: string,
    description?: string,
    amount?: number,
    category?: ExpenseCategory,
    expenseDate?: Date,
    projectId?: string,
    notes?: string
  ): void {
    if (this.props.status !== ExpenseStatus.DRAFT) {
      throw new DomainException('Can only update draft expenses');
    }

    if (title && title.trim().length > 0) {
      this.props.title = title.trim();
    }
    if (description !== undefined) {
      this.props.description = description.trim();
    }
    if (amount && amount > 0) {
      this.props.amount = amount;
    }
    if (category) {
      this.props.category = category;
    }
    if (expenseDate && expenseDate <= new Date()) {
      this.props.expenseDate = expenseDate;
    }
    if (projectId !== undefined) {
      this.props.projectId = projectId?.trim();
    }
    if (notes !== undefined) {
      this.props.notes = notes?.trim();
    }

    this.props.updatedAt = new Date();
  }

  isEditable(): boolean {
    return this.props.status === ExpenseStatus.DRAFT;
  }

  canBeSubmitted(): boolean {
    return this.props.status === ExpenseStatus.DRAFT && !!this.props.receipt;
  }

  toSnapshot(): ExpenseReportProps & { id: string } {
    return {
      id: this.id,
      ...this.props
    };
  }
}
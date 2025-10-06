import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as puppeteer from 'puppeteer';
import PDFDocument = require('pdfkit');
import * as QRCode from 'qrcode';
import * as Handlebars from 'handlebars';
import { createHash } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';

export interface PDFGenerationOptions {
  template: 'invoice' | 'receipt' | 'statement' | 'report';
  data: Record<string, any>;
  format?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  margins?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  watermark?: {
    text: string;
    opacity?: number;
    fontSize?: number;
    color?: string;
    position?: 'center' | 'diagonal' | 'top-right' | 'bottom-left';
  };
  security?: {
    password?: string;
    permissions?: {
      printing?: boolean;
      modifying?: boolean;
      copying?: boolean;
      annotating?: boolean;
      fillingForms?: boolean;
      extracting?: boolean;
    };
  };
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
    creator?: string;
    producer?: string;
  };
  attachments?: Array<{
    filename: string;
    content: Buffer;
    mimeType?: string;
  }>;
  digitalSignature?: {
    certificate: Buffer;
    privateKey: Buffer;
    reason?: string;
    location?: string;
    contactInfo?: string;
  };
  branding?: {
    logo?: string;
    colors?: {
      primary: string;
      secondary: string;
      accent: string;
    };
    fonts?: {
      primary: string;
      secondary: string;
    };
  };
  qrCode?: {
    data: string;
    size?: number;
    position?: 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left';
  };
}

export interface PDFGenerationResult {
  buffer: Buffer;
  filename: string;
  size: number;
  hash: string;
  metadata: {
    pages: number;
    createdAt: Date;
    template: string;
    version: string;
  };
  security?: {
    encrypted: boolean;
    permissions: string[];
  };
}

@Injectable()
export class PDFService {
  private readonly logger = new Logger(PDFService.name);
  private readonly outputDir: string;
  private puppeteerBrowser: puppeteer.Browser | null = null;

  constructor(private readonly configService: ConfigService) {
    this.outputDir = this.configService.get('PDF_OUTPUT_DIR', './storage/pdfs');
    this.initializePuppeteer();
  }

  /**
   * Generate PDF with advanced features and templates
   */
  async generatePDF(options: PDFGenerationOptions): Promise<PDFGenerationResult> {
    try {
      this.logger.log(`Generating PDF with template: ${options.template}`);

      // Validate template data
      await this.validateTemplateData(options.template, options.data);

      // Generate PDF based on method preference
      const useAdvancedEngine = this.configService.get('PDF_USE_ADVANCED_ENGINE', true);
      
      let buffer: Buffer;
      if (useAdvancedEngine) {
        buffer = await this.generateWithPuppeteer(options);
      } else {
        buffer = await this.generateWithPDFKit(options);
      }

      // Apply security if specified
      if (options.security) {
        buffer = await this.applySecuritySettings(buffer, options.security);
      }

      // Generate metadata
      const filename = this.generateFilename(options);
      const hash = createHash('sha256').update(buffer).digest('hex');

      const result: PDFGenerationResult = {
        buffer,
        filename,
        size: buffer.length,
        hash,
        metadata: {
          pages: await this.getPageCount(buffer),
          createdAt: new Date(),
          template: options.template,
          version: '2.0',
        },
        security: options.security ? {
          encrypted: !!options.security.password,
          permissions: this.getPermissionsList(options.security.permissions),
        } : undefined,
      };

      // Save to storage if configured
      if (this.configService.get('PDF_SAVE_TO_STORAGE', true)) {
        await this.savePDFToStorage(result);
      }

      this.logger.log(`PDF generated successfully: ${filename} (${buffer.length} bytes)`);
      return result;

    } catch (error) {
      this.logger.error(`PDF generation failed:`, error);
      throw new BadRequestException(`PDF generation failed: ${error.message}`);
    }
  }

  /**
   * Generate PDF using Puppeteer for complex layouts
   */
  private async generateWithPuppeteer(options: PDFGenerationOptions): Promise<Buffer> {
    if (!this.puppeteerBrowser) {
      await this.initializePuppeteer();
    }

    const page = await this.puppeteerBrowser!.newPage();
    
    try {
      // Generate HTML from template
      const html = await this.renderTemplate(options);
      
      await page.setContent(html, { 
        waitUntil: ['networkidle0', 'domcontentloaded'] 
      });

      // Configure PDF options
      const pdfOptions: puppeteer.PDFOptions = {
        format: (options.format || 'A4') as puppeteer.PaperFormat,
        landscape: options.orientation === 'landscape',
        margin: options.margins || {
          top: '20mm',
          bottom: '20mm',
          left: '15mm',
          right: '15mm',
        },
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: await this.getHeaderTemplate(options),
        footerTemplate: await this.getFooterTemplate(options),
      };

      const buffer = await page.pdf(pdfOptions);
      return Buffer.from(buffer);

    } finally {
      await page.close();
    }
  }

  /**
   * Generate PDF using PDFKit for programmatic control
   */
  private async generateWithPDFKit(options: PDFGenerationOptions): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: options.format || 'A4',
          layout: options.orientation || 'portrait',
          margins: options.margins || {
            top: 72,
            bottom: 72,
            left: 72,
            right: 72,
          },
          info: {
            Title: options.metadata?.title || 'Finvoice Document',
            Author: options.metadata?.author || 'Finvoice System',
            Subject: options.metadata?.subject,
            Keywords: options.metadata?.keywords?.join(', '),
            Creator: options.metadata?.creator || 'Finvoice PDF Service',
            Producer: options.metadata?.producer || 'Finvoice v2.0',
          },
        });

        const chunks: Buffer[] = [];
        
        // Handle stream events - PDFDocument extends stream.Readable
        (doc as any).on('data', (chunk: any) => chunks.push(chunk));
        (doc as any).on('end', () => resolve(Buffer.concat(chunks)));
        (doc as any).on('error', reject);

        // Add content based on template
        await this.addContentToPDFKit(doc, options);

        // Add watermark if specified
        if (options.watermark) {
          this.addWatermark(doc, options.watermark);
        }

        // Add QR code if specified
        if (options.qrCode) {
          await this.addQRCode(doc, options.qrCode);
        }

        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Render HTML template with data
   */
  private async renderTemplate(options: PDFGenerationOptions): Promise<string> {
    const templatePath = join(process.cwd(), `shared/templates/${options.template}.hbs`);
    
    try {
      const templateContent = await readFile(templatePath, 'utf-8');
      
      // Use Handlebars or similar templating engine
      // Use Handlebars for template compilation
      
      // Register custom helpers
      this.registerHandlebarsHelpers(Handlebars);
      
      const template = Handlebars.compile(templateContent);
      
      // Prepare template data with additional context
      const templateData = {
        ...options.data,
        _meta: {
          generatedAt: new Date().toISOString(),
          template: options.template,
          branding: options.branding,
        },
        _config: {
          baseUrl: this.configService.get('APP_URL'),
          logoUrl: options.branding?.logo,
          colors: options.branding?.colors,
        },
      };

      const html = template(templateData);
      
      // Add CSS styling
      const css = await this.getTemplateCSS(options.template, options.branding);
      
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${options.metadata?.title || 'Document'}</title>
            <style>${css}</style>
          </head>
          <body>
            ${html}
          </body>
        </html>
      `;

    } catch (error) {
      throw new Error(`Template rendering failed: ${error.message}`);
    }
  }

  /**
   * Add content to PDFKit document
   */
  private async addContentToPDFKit(doc: any, options: PDFGenerationOptions): Promise<void> {
    switch (options.template) {
      case 'invoice':
        await this.addInvoiceContent(doc, options.data, options.branding);
        break;
      case 'receipt':
        await this.addReceiptContent(doc, options.data, options.branding);
        break;
      case 'statement':
        await this.addStatementContent(doc, options.data, options.branding);
        break;
      case 'report':
        await this.addReportContent(doc, options.data, options.branding);
        break;
      default:
        throw new Error(`Unsupported template: ${options.template}`);
    }
  }

  /**
   * Add invoice content to PDF
   */
  private async addInvoiceContent(doc: any, data: any, branding?: any): Promise<void> {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 72;

    let yPosition = margin;

    // Header with logo and company info
    if (branding?.logo) {
      doc.image(branding.logo, margin, yPosition, { width: 150 });
    }

    // Company information
    doc.fontSize(20)
       .fillColor(branding?.colors?.primary || '#333333')
       .text('INVOICE', pageWidth - 200, yPosition, { align: 'right' });

    yPosition += 80;

    // Invoice details
    doc.fontSize(12)
       .fillColor('#000000')
       .text(`Invoice #: ${data.invoiceNumber}`, margin, yPosition)
       .text(`Date: ${new Date(data.issueDate).toLocaleDateString()}`, margin, yPosition + 20)
       .text(`Due Date: ${new Date(data.dueDate).toLocaleDateString()}`, margin, yPosition + 40);

    // Customer information
    doc.text('Bill To:', pageWidth - 200, yPosition)
       .text(data.customer?.name || 'Customer Name', pageWidth - 200, yPosition + 20)
       .text(data.customer?.address || 'Customer Address', pageWidth - 200, yPosition + 40);

    yPosition += 120;

    // Line items table
    await this.addInvoiceTable(doc, data.lineItems, yPosition);

    // Footer with totals
    const footerY = pageHeight - 200;
    doc.fontSize(14)
       .text(`Subtotal: $${data.subtotal.toFixed(2)}`, pageWidth - 200, footerY)
       .text(`Tax: $${(data.tax || 0).toFixed(2)}`, pageWidth - 200, footerY + 20)
       .fontSize(16)
       .fillColor(branding?.colors?.primary || '#333333')
       .text(`Total: $${data.totalAmount.toFixed(2)}`, pageWidth - 200, footerY + 50);

    // Terms and notes
    if (data.terms || data.notes) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text('Terms & Conditions:', margin, footerY)
         .text(data.terms || data.notes || '', margin, footerY + 15, { width: 300 });
    }
  }

  /**
   * Add line items table to invoice
   */
  private async addInvoiceTable(doc: any, lineItems: any[], startY: number): Promise<void> {
    const tableTop = startY;
    const itemX = 72;
    const descriptionX = 150;
    const quantityX = 350;
    const priceX = 430;
    const totalX = 500;

    // Table headers
    doc.fontSize(12)
       .fillColor('#333333')
       .text('Item', itemX, tableTop)
       .text('Description', descriptionX, tableTop)
       .text('Qty', quantityX, tableTop)
       .text('Price', priceX, tableTop)
       .text('Total', totalX, tableTop);

    // Draw header line
    doc.moveTo(itemX, tableTop + 20)
       .lineTo(totalX + 50, tableTop + 20)
       .stroke();

    let yPosition = tableTop + 35;

    // Add line items
    lineItems.forEach((item, index) => {
      doc.fontSize(10)
         .fillColor('#000000')
         .text(index + 1, itemX, yPosition)
         .text(item.description, descriptionX, yPosition, { width: 180 })
         .text(item.quantity.toString(), quantityX, yPosition)
         .text(`$${item.unitPrice.toFixed(2)}`, priceX, yPosition)
         .text(`$${item.total.toFixed(2)}`, totalX, yPosition);

      yPosition += 25;
    });

    // Draw bottom line
    doc.moveTo(itemX, yPosition)
       .lineTo(totalX + 50, yPosition)
       .stroke();
  }

  /**
   * Add watermark to document
   */
  private addWatermark(doc: any, watermark: NonNullable<PDFGenerationOptions['watermark']>): void {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    doc.save();
    
    // Set opacity and color
    doc.opacity(watermark.opacity || 0.1)
       .fillColor(watermark.color || '#CCCCCC')
       .fontSize(watermark.fontSize || 72);

    // Position watermark
    switch (watermark.position) {
      case 'center':
        doc.text(watermark.text, 0, pageHeight / 2, {
          align: 'center',
          width: pageWidth,
        });
        break;
      case 'diagonal':
        doc.rotate(-45, { origin: [pageWidth / 2, pageHeight / 2] })
           .text(watermark.text, 0, pageHeight / 2, {
             align: 'center',
             width: pageWidth,
           });
        break;
      default:
        doc.text(watermark.text, pageWidth - 200, 50);
    }

    doc.restore();
  }

  /**
   * Add QR code to document
   */
  private async addQRCode(doc: any, qrOptions: NonNullable<PDFGenerationOptions['qrCode']>): Promise<void> {
    try {
      const qrBuffer = await QRCode.toBuffer(qrOptions.data, {
        width: qrOptions.size || 100,
        margin: 2,
      });

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const size = qrOptions.size || 100;

      let x, y;
      switch (qrOptions.position) {
        case 'top-right':
          x = pageWidth - size - 72;
          y = 72;
          break;
        case 'bottom-right':
          x = pageWidth - size - 72;
          y = pageHeight - size - 72;
          break;
        case 'bottom-left':
          x = 72;
          y = pageHeight - size - 72;
          break;
        default: // top-left
          x = 72;
          y = 72;
      }

      doc.image(qrBuffer, x, y, { width: size });

    } catch (error) {
      this.logger.warn(`QR code generation failed: ${error.message}`);
    }
  }

  /**
   * Additional template content methods
   */
  private async addReceiptContent(doc: any, data: any, branding?: any): Promise<void> {
    // Receipt-specific layout implementation
    // Smaller format, focused on payment details
  }

  private async addStatementContent(doc: any, data: any, branding?: any): Promise<void> {
    // Statement-specific layout implementation
    // Multi-page format with transaction history
  }

  private async addReportContent(doc: any, data: any, branding?: any): Promise<void> {
    // Report-specific layout implementation
    // Charts, graphs, and analytics data
  }

  /**
   * Utility methods
   */
  private async initializePuppeteer(): Promise<void> {
    try {
      this.puppeteerBrowser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.logger.log('Puppeteer browser initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Puppeteer:', error);
    }
  }

  private async validateTemplateData(template: string, data: any): Promise<void> {
    const requiredFields: Record<string, string[]> = {
      invoice: ['invoiceNumber', 'issueDate', 'dueDate', 'lineItems', 'totalAmount'],
      receipt: ['paymentId', 'amount', 'paymentDate', 'method'],
      statement: ['accountNumber', 'statementDate', 'transactions'],
      report: ['reportType', 'dateRange', 'data'],
    };

    const required = requiredFields[template];
    if (required) {
      for (const field of required) {
        if (!(field in data)) {
          throw new Error(`Missing required field for ${template} template: ${field}`);
        }
      }
    }
  }

  private generateFilename(options: PDFGenerationOptions): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const template = options.template;
    const identifier = options.data.invoiceNumber || options.data.paymentId || 'document';
    return `${template}-${identifier}-${timestamp}.pdf`;
  }

  private async getPageCount(buffer: Buffer): Promise<number> {
    // Implement PDF page counting logic
    return 1; // Placeholder
  }

  private getPermissionsList(permissions?: any): string[] {
    if (!permissions) return [];
    
    return Object.entries(permissions)
      .filter(([_, allowed]) => allowed)
      .map(([permission]) => permission);
  }

  private async savePDFToStorage(result: PDFGenerationResult): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
    const filePath = join(this.outputDir, result.filename);
    await writeFile(filePath, result.buffer);
  }

  private async applySecuritySettings(buffer: Buffer, security: any): Promise<Buffer> {
    // Implement PDF security/encryption
    // This would require a PDF manipulation library like pdf-lib
    return buffer; // Placeholder
  }

  private registerHandlebarsHelpers(Handlebars: any): void {
    // Custom template helpers
    Handlebars.registerHelper('formatCurrency', (amount: number, currency = 'USD') => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      }).format(amount);
    });

    Handlebars.registerHelper('formatDate', (date: string | Date, format = 'short') => {
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: format as any,
      }).format(new Date(date));
    });

    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    Handlebars.registerHelper('gt', (a: number, b: number) => a > b);
    Handlebars.registerHelper('lt', (a: number, b: number) => a < b);
  }

  private async getTemplateCSS(template: string, branding?: any): Promise<string> {
    // Return CSS based on template and branding
    const baseCss = `
      body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; }
      .header { border-bottom: 2px solid ${branding?.colors?.primary || '#007bff'}; padding-bottom: 20px; }
      .invoice-title { color: ${branding?.colors?.primary || '#007bff'}; font-size: 24px; font-weight: bold; }
      .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      .table th, .table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
      .total { font-size: 18px; font-weight: bold; color: ${branding?.colors?.primary || '#007bff'}; }
    `;
    
    return baseCss;
  }

  private async getHeaderTemplate(options: PDFGenerationOptions): Promise<string> {
    return `
      <div style="font-size: 10px; color: #666; margin: 0 20px;">
        <span>${options.metadata?.title || 'Document'}</span>
      </div>
    `;
  }

  private async getFooterTemplate(options: PDFGenerationOptions): Promise<string> {
    return `
      <div style="font-size: 10px; color: #666; margin: 0 20px; text-align: center;">
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        <span style="float: right;">Generated by Finvoice on ${new Date().toLocaleDateString()}</span>
      </div>
    `;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.puppeteerBrowser) {
      await this.puppeteerBrowser.close();
      this.logger.log('Puppeteer browser closed');
    }
  }
}
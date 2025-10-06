import { TaxRate } from '../../../src/modules/billing/domain/value-objects/tax-rate';
import { DomainException } from '../../../src/shared/kernel/exceptions/domain.exception';

describe('TaxRate Value Object Tests', () => {
  describe('TaxRate Creation', () => {
    it('should create valid tax rate instance', () => {
      const taxRate = new TaxRate(20, 'VAT');
      
      expect(taxRate.rate).toBe(20);
      expect(taxRate.type).toBe('VAT');
    });

    it('should create standard tax rate', () => {
      const taxRate = TaxRate.create(15, 'SALES_TAX');
      
      expect(taxRate.rate).toBe(15);
      expect(taxRate.type).toBe('SALES_TAX');
    });

    it('should create zero tax rate', () => {
      const taxRate = TaxRate.noTax();
      
      expect(taxRate.rate).toBe(0);
      expect(taxRate.type).toBe('NO_TAX');
      expect(taxRate.isZero()).toBe(true);
    });
  });

  describe('TaxRate Validation', () => {
    it('should throw error for invalid rate', () => {
      expect(() => new TaxRate(NaN, 'VAT')).toThrow(DomainException);
      expect(() => new TaxRate(Infinity, 'VAT')).toThrow(DomainException);
      expect(() => new TaxRate(-5, 'VAT')).toThrow(DomainException);
      expect(() => new TaxRate(150, 'VAT')).toThrow(DomainException);
    });

    it('should throw error for invalid type', () => {
      expect(() => new TaxRate(10, '')).toThrow(DomainException);
      expect(() => new TaxRate(10, 'INVALID_TYPE')).toThrow(DomainException);
    });

    it('should accept valid types', () => {
      const validTypes = ['SALES_TAX', 'VAT', 'GST', 'STATE_TAX', 'CITY_TAX', 'NO_TAX', 'COMBINED_TAX'];
      
      validTypes.forEach(type => {
        expect(() => new TaxRate(10, type)).not.toThrow();
      });
    });
  });

  describe('Tax Calculations', () => {
    it('should calculate tax amount correctly', () => {
      const taxRate = new TaxRate(20, 'VAT');
      const baseAmount = 100;
      
      const taxAmount = taxRate.calculateTax(baseAmount);
      
      expect(taxAmount).toBe(20);
    });

    it('should handle zero tax rate', () => {
      const taxRate = TaxRate.noTax();
      const baseAmount = 100;
      
      const taxAmount = taxRate.calculateTax(baseAmount);
      
      expect(taxAmount).toBe(0);
    });

    it('should handle decimal rates', () => {
      const taxRate = new TaxRate(8.5, 'SALES_TAX');
      const baseAmount = 100;
      
      const taxAmount = taxRate.calculateTax(baseAmount);
      
      expect(taxAmount).toBe(8.5);
    });

    it('should get decimal rate', () => {
      const taxRate = new TaxRate(25, 'VAT');
      
      expect(taxRate.getDecimalRate()).toBe(0.25);
    });
  });

  describe('Tax Rate Comparison', () => {
    it('should identify equal tax rates', () => {
      const rate1 = new TaxRate(20, 'VAT');
      const rate2 = new TaxRate(20, 'VAT');
      
      expect(rate1.equals(rate2)).toBe(true);
    });

    it('should identify different rates', () => {
      const rate1 = new TaxRate(20, 'VAT');
      const rate2 = new TaxRate(21, 'VAT');
      const rate3 = new TaxRate(20, 'SALES_TAX');
      
      expect(rate1.equals(rate2)).toBe(false);
      expect(rate1.equals(rate3)).toBe(false);
    });

    it('should compare tax rates', () => {
      const rate1 = new TaxRate(20, 'VAT');
      const rate2 = new TaxRate(25, 'VAT');
      
      expect(rate1.isLessThan(rate2)).toBe(true);
      expect(rate2.isGreaterThan(rate1)).toBe(true);
      expect(rate1.isGreaterThan(rate2)).toBe(false);
      expect(rate2.isLessThan(rate1)).toBe(false);
    });
  });

  describe('Tax Rate Display', () => {
    it('should format regular tax rate', () => {
      const taxRate = new TaxRate(20, 'VAT');
      
      const display = taxRate.toDisplayString();
      
      expect(display).toBe('VAT (20.00%)');
    });

    it('should format zero tax rate', () => {
      const taxRate = TaxRate.noTax();
      
      const display = taxRate.toDisplayString();
      
      expect(display).toBe('No Tax (0%)');
    });

    it('should format complex tax type', () => {
      const taxRate = new TaxRate(8.25, 'COMBINED_TAX');
      
      const display = taxRate.toDisplayString();
      
      expect(display).toBe('COMBINED TAX (8.25%)');
    });
  });

  describe('Tax Rate State Checks', () => {
    it('should identify zero tax rate', () => {
      const zeroRate = TaxRate.noTax();
      const nonZeroRate = new TaxRate(10, 'VAT');
      
      expect(zeroRate.isZero()).toBe(true);
      expect(nonZeroRate.isZero()).toBe(false);
    });
  });
});
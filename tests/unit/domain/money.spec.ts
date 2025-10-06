import { Money } from '../../../src/modules/billing/domain/value-objects/money';
import { DomainException } from '../../../src/shared/kernel/exceptions/domain.exception';

describe('Money Value Object Tests', () => {
  describe('Money Creation', () => {
    it('should create valid money instance', () => {
      const money = new Money(100.50, 'USD');
      
      expect(money.amount).toBe(100.50);
      expect(money.currency).toBe('USD');
    });

    it('should handle zero amount', () => {
      const money = new Money(0, 'EUR');
      
      expect(money.amount).toBe(0);
      expect(money.isZero()).toBe(true);
    });

    it('should handle negative amount', () => {
      const money = new Money(-50.25, 'GBP');
      
      expect(money.amount).toBe(-50.25);
      expect(money.isNegative()).toBe(true);
    });
  });

  describe('Money Validation', () => {
    it('should throw error for invalid amount', () => {
      expect(() => new Money(NaN, 'USD')).toThrow(DomainException);
      expect(() => new Money(Infinity, 'USD')).toThrow(DomainException);
      expect(() => new Money('invalid' as any, 'USD')).toThrow(DomainException);
    });

    it('should throw error for invalid currency', () => {
      expect(() => new Money(100, '')).toThrow(DomainException);
      expect(() => new Money(100, 'XX')).toThrow(DomainException);
      expect(() => new Money(100, 'INVALID')).toThrow(DomainException);
    });

    it('should reject amounts with too many decimal places', () => {
      expect(() => new Money(100.123, 'USD')).toThrow(DomainException);
    });

    it('should accept valid currencies', () => {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR'];
      
      validCurrencies.forEach(currency => {
        expect(() => new Money(100, currency)).not.toThrow();
      });
    });
  });

  describe('Money Arithmetic', () => {
    it('should add money with same currency', () => {
      const money1 = new Money(100, 'USD');
      const money2 = new Money(50, 'USD');
      
      const result = Money.add(money1, money2);
      
      expect(result.amount).toBe(150);
      expect(result.currency).toBe('USD');
    });

    it('should subtract money with same currency', () => {
      const money1 = new Money(100, 'USD');
      const money2 = new Money(30, 'USD');
      
      const result = Money.subtract(money1, money2);
      
      expect(result.amount).toBe(70);
      expect(result.currency).toBe('USD');
    });

    it('should multiply money by scalar', () => {
      const money = new Money(50, 'EUR');
      
      const result = Money.multiply(money, 2.5);
      
      expect(result.amount).toBe(125);
      expect(result.currency).toBe('EUR');
    });

    it('should divide money by scalar', () => {
      const money = new Money(100, 'GBP');
      
      const result = Money.divide(money, 4);
      
      expect(result.amount).toBe(25);
      expect(result.currency).toBe('GBP');
    });

    it('should throw error when adding different currencies', () => {
      const usdMoney = new Money(100, 'USD');
      const eurMoney = new Money(50, 'EUR');
      
      expect(() => Money.add(usdMoney, eurMoney)).toThrow(DomainException);
    });

    it('should throw error when dividing by zero', () => {
      const money = new Money(100, 'USD');
      
      expect(() => Money.divide(money, 0)).toThrow(DomainException);
    });
  });

  describe('Money Comparison', () => {
    it('should identify equal money', () => {
      const money1 = new Money(100, 'USD');
      const money2 = new Money(100, 'USD');
      
      expect(money1.equals(money2)).toBe(true);
    });

    it('should identify different amounts', () => {
      const money1 = new Money(100, 'USD');
      const money2 = new Money(150, 'USD');
      
      expect(money1.equals(money2)).toBe(false);
    });

    it('should identify different currencies', () => {
      const money1 = new Money(100, 'USD');
      const money2 = new Money(100, 'EUR');
      
      expect(money1.equals(money2)).toBe(false);
    });

    it('should compare greater than', () => {
      const money1 = new Money(150, 'USD');
      const money2 = new Money(100, 'USD');
      
      expect(money1.isGreaterThan(money2)).toBe(true);
      expect(money2.isGreaterThan(money1)).toBe(false);
    });

    it('should compare less than', () => {
      const money1 = new Money(50, 'USD');
      const money2 = new Money(100, 'USD');
      
      expect(money1.isLessThan(money2)).toBe(true);
      expect(money2.isLessThan(money1)).toBe(false);
    });

    it('should throw error when comparing different currencies', () => {
      const usdMoney = new Money(100, 'USD');
      const eurMoney = new Money(100, 'EUR');
      
      expect(() => usdMoney.isGreaterThan(eurMoney)).toThrow(DomainException);
      expect(() => usdMoney.isLessThan(eurMoney)).toThrow(DomainException);
    });
  });

  describe('Money State Checks', () => {
    it('should identify zero money', () => {
      const money = new Money(0, 'USD');
      
      expect(money.isZero()).toBe(true);
      expect(money.isPositive()).toBe(false);
      expect(money.isNegative()).toBe(false);
    });

    it('should identify positive money', () => {
      const money = new Money(100, 'USD');
      
      expect(money.isPositive()).toBe(true);
      expect(money.isZero()).toBe(false);
      expect(money.isNegative()).toBe(false);
    });

    it('should identify negative money', () => {
      const money = new Money(-50, 'USD');
      
      expect(money.isNegative()).toBe(true);
      expect(money.isZero()).toBe(false);
      expect(money.isPositive()).toBe(false);
    });
  });

  describe('Money Display', () => {
    it('should format USD correctly', () => {
      const money = new Money(1234.56, 'USD');
      
      const display = money.toDisplayString();
      
      expect(display).toBe('$1,234.56');
    });

    it('should format EUR correctly', () => {
      const money = new Money(999.99, 'EUR');
      
      const display = money.toDisplayString();
      
      expect(display).toBe('€999.99');
    });

    it('should format GBP correctly', () => {
      const money = new Money(555.00, 'GBP');
      
      const display = money.toDisplayString();
      
      expect(display).toBe('£555.00');
    });

    it('should handle zero amount display', () => {
      const money = new Money(0, 'USD');
      
      const display = money.toDisplayString();
      
      expect(display).toBe('$0.00');
    });

    it('should handle negative amount display', () => {
      const money = new Money(-123.45, 'USD');
      
      const display = money.toDisplayString();
      
      expect(display).toBe('-$123.45');
    });
  });
});
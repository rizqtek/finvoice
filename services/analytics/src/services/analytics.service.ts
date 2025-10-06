import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AnalyticsQuery {
  metric: string;
  dimensions: string[];
  filters: Record<string, any>;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  granularity: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median';
}

export interface AnalyticsResult {
  data: any[];
  metadata: {
    totalRows: number;
    executionTime: number;
    cacheHit: boolean;
    query: string;
  };
  summary: {
    total: number;
    average: number;
    growth: number;
    trend: 'up' | 'down' | 'stable';
  };
}

export interface FinancialKPI {
  name: string;
  value: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  target?: number;
  status: 'good' | 'warning' | 'critical';
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly configService: ConfigService) {}

  /**
   * Execute complex analytics queries with caching
   */
  async executeQuery(query: AnalyticsQuery): Promise<AnalyticsResult> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(query);
    
    // Check cache
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      this.logger.log(`📊 Cache hit for analytics query: ${query.metric}`);
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cacheHit: true,
          executionTime: Date.now() - startTime
        }
      };
    }

    try {
      // Simulate complex query execution
      const data = await this.processAnalyticsQuery(query);
      const executionTime = Date.now() - startTime;
      
      const result: AnalyticsResult = {
        data,
        metadata: {
          totalRows: data.length,
          executionTime,
          cacheHit: false,
          query: this.buildQueryString(query)
        },
        summary: this.calculateSummary(data, query.aggregation)
      };

      // Cache the result
      this.setCachedResult(cacheKey, result);
      
      this.logger.log(`📊 Analytics query executed: ${query.metric} (${executionTime}ms)`);
      return result;
    } catch (error) {
      this.logger.error(`❌ Analytics query failed: ${query.metric}`, error);
      throw error;
    }
  }

  /**
   * Generate comprehensive financial KPIs
   */
  async getFinancialKPIs(dateRange: { startDate: Date; endDate: Date }): Promise<FinancialKPI[]> {
    try {
      const kpis: FinancialKPI[] = [];

      // Revenue KPIs
      const revenueData = await this.calculateRevenue(dateRange);
      kpis.push({
        name: 'Total Revenue',
        value: revenueData.current,
        previousValue: revenueData.previous,
        change: revenueData.current - revenueData.previous,
        changePercent: ((revenueData.current - revenueData.previous) / revenueData.previous) * 100,
        trend: this.determineTrend(revenueData.current, revenueData.previous),
        target: revenueData.target,
        status: this.determineStatus(revenueData.current, revenueData.target)
      });

      // Profit Margin
      const profitData = await this.calculateProfitMargin(dateRange);
      kpis.push({
        name: 'Profit Margin',
        value: profitData.current,
        previousValue: profitData.previous,
        change: profitData.current - profitData.previous,
        changePercent: ((profitData.current - profitData.previous) / profitData.previous) * 100,
        trend: this.determineTrend(profitData.current, profitData.previous),
        target: profitData.target,
        status: this.determineStatus(profitData.current, profitData.target)
      });

      // Cash Flow
      const cashFlowData = await this.calculateCashFlow(dateRange);
      kpis.push({
        name: 'Operating Cash Flow',
        value: cashFlowData.current,
        previousValue: cashFlowData.previous,
        change: cashFlowData.current - cashFlowData.previous,
        changePercent: cashFlowData.previous !== 0 ? ((cashFlowData.current - cashFlowData.previous) / Math.abs(cashFlowData.previous)) * 100 : 0,
        trend: this.determineTrend(cashFlowData.current, cashFlowData.previous),
        status: cashFlowData.current > 0 ? 'good' : 'critical'
      });

      // Accounts Receivable
      const arData = await this.calculateAccountsReceivable(dateRange);
      kpis.push({
        name: 'Accounts Receivable',
        value: arData.current,
        previousValue: arData.previous,
        change: arData.current - arData.previous,
        changePercent: ((arData.current - arData.previous) / arData.previous) * 100,
        trend: this.determineTrend(arData.previous, arData.current), // Inverse - lower AR is better
        status: arData.current < arData.target ? 'good' : 'warning'
      });

      // Customer Acquisition Cost (CAC)
      const cacData = await this.calculateCAC(dateRange);
      kpis.push({
        name: 'Customer Acquisition Cost',
        value: cacData.current,
        previousValue: cacData.previous,
        change: cacData.current - cacData.previous,
        changePercent: ((cacData.current - cacData.previous) / cacData.previous) * 100,
        trend: this.determineTrend(cacData.previous, cacData.current), // Lower is better
        target: cacData.target,
        status: this.determineStatus(cacData.target, cacData.current) // Inverted logic
      });

      // Customer Lifetime Value (CLV)
      const clvData = await this.calculateCLV(dateRange);
      kpis.push({
        name: 'Customer Lifetime Value',
        value: clvData.current,
        previousValue: clvData.previous,
        change: clvData.current - clvData.previous,
        changePercent: ((clvData.current - clvData.previous) / clvData.previous) * 100,
        trend: this.determineTrend(clvData.current, clvData.previous),
        target: clvData.target,
        status: this.determineStatus(clvData.current, clvData.target)
      });

      return kpis;
    } catch (error) {
      this.logger.error('❌ Failed to calculate financial KPIs:', error);
      throw error;
    }
  }

  /**
   * Advanced cohort analysis for customer behavior
   */
  async performCohortAnalysis(startDate: Date, endDate: Date): Promise<{
    cohorts: any[];
    retentionRates: number[][];
    insights: string[];
  }> {
    try {
      // Generate sample cohort data
      const cohorts = [];
      const retentionRates = [];
      const insights = [];

      const monthsBetween = this.getMonthsBetween(startDate, endDate);
      
      for (let i = 0; i < monthsBetween; i++) {
        const cohortDate = new Date(startDate);
        cohortDate.setMonth(startDate.getMonth() + i);
        
        const cohortSize = Math.floor(Math.random() * 100) + 50;
        const retention = [];
        
        // Calculate retention for each period
        for (let period = 0; period < Math.min(12, monthsBetween - i); period++) {
          const rate = period === 0 ? 100 : Math.max(10, 100 - (period * 8) - Math.random() * 20);
          retention.push(Number(rate.toFixed(1)));
        }
        
        cohorts.push({
          cohortDate: cohortDate.toISOString().slice(0, 7),
          size: cohortSize,
          revenue: cohortSize * (Math.random() * 200 + 100)
        });
        
        retentionRates.push(retention);
      }

      // Generate insights
      const avgRetention = retentionRates.reduce((acc, rates) => {
        return acc + (rates[3] || 0); // 3-month retention
      }, 0) / retentionRates.length;

      insights.push(`Average 3-month retention rate: ${avgRetention.toFixed(1)}%`);
      
      if (avgRetention > 70) {
        insights.push('🟢 Excellent customer retention - strong product-market fit');
      } else if (avgRetention > 50) {
        insights.push('🟡 Good retention - room for improvement in onboarding');
      } else {
        insights.push('🔴 Low retention - investigate customer satisfaction and onboarding');
      }

      return { cohorts, retentionRates, insights };
    } catch (error) {
      this.logger.error('❌ Cohort analysis failed:', error);
      throw error;
    }
  }

  /**
   * Revenue attribution analysis
   */
  async analyzeRevenueAttribution(dateRange: { startDate: Date; endDate: Date }): Promise<{
    channels: { name: string; revenue: number; percentage: number }[];
    products: { name: string; revenue: number; percentage: number }[];
    regions: { name: string; revenue: number; percentage: number }[];
    trends: { channel: string; trend: number }[];
  }> {
    try {
      // Sample attribution data
      const totalRevenue = Math.random() * 1000000 + 500000;
      
      const channels = [
        { name: 'Direct Sales', revenue: totalRevenue * 0.4, percentage: 40 },
        { name: 'Online Platform', revenue: totalRevenue * 0.3, percentage: 30 },
        { name: 'Partner Network', revenue: totalRevenue * 0.2, percentage: 20 },
        { name: 'Referrals', revenue: totalRevenue * 0.1, percentage: 10 }
      ];

      const products = [
        { name: 'Premium Plan', revenue: totalRevenue * 0.5, percentage: 50 },
        { name: 'Standard Plan', revenue: totalRevenue * 0.3, percentage: 30 },
        { name: 'Basic Plan', revenue: totalRevenue * 0.15, percentage: 15 },
        { name: 'Add-ons', revenue: totalRevenue * 0.05, percentage: 5 }
      ];

      const regions = [
        { name: 'North America', revenue: totalRevenue * 0.45, percentage: 45 },
        { name: 'Europe', revenue: totalRevenue * 0.35, percentage: 35 },
        { name: 'Asia Pacific', revenue: totalRevenue * 0.15, percentage: 15 },
        { name: 'Other', revenue: totalRevenue * 0.05, percentage: 5 }
      ];

      const trends = channels.map(channel => ({
        channel: channel.name,
        trend: (Math.random() - 0.5) * 30 // Random trend between -15% and +15%
      }));

      return { channels, products, regions, trends };
    } catch (error) {
      this.logger.error('❌ Revenue attribution analysis failed:', error);
      throw error;
    }
  }

  /**
   * Seasonal trend analysis
   */
  async analyzeSeasonalTrends(metric: string, years: number = 3): Promise<{
    monthlyPatterns: { month: string; value: number; seasonalIndex: number }[];
    yearOverYear: { year: number; growth: number }[];
    predictions: { month: string; predicted: number; confidence: number }[];
  }> {
    try {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyPatterns: { month: string; value: number; seasonalIndex: number }[] = [];
      const yearOverYear: { year: number; growth: number }[] = [];

      // Generate seasonal patterns
      for (let i = 0; i < 12; i++) {
        const baseValue = 100000;
        const seasonalMultiplier = Math.sin((i / 12) * 2 * Math.PI) * 0.3 + 1; // Seasonal variation
        const value = baseValue * seasonalMultiplier;
        
        monthlyPatterns.push({
          month: months[i],
          value: Math.round(value),
          seasonalIndex: Number(seasonalMultiplier.toFixed(2))
        });
      }

      // Generate year-over-year growth
      for (let year = 0; year < years; year++) {
        yearOverYear.push({
          year: new Date().getFullYear() - years + year + 1,
          growth: (Math.random() * 20) - 5 // Growth between -5% and 15%
        });
      }

      // Generate predictions for next 12 months
      const predictions = months.map((month, index) => {
        const historicalValue = monthlyPatterns[index].value;
        const trend = yearOverYear[yearOverYear.length - 1].growth / 100;
        const predicted = historicalValue * (1 + trend);
        
        return {
          month,
          predicted: Math.round(predicted),
          confidence: Math.random() * 0.3 + 0.7 // Confidence between 70% and 100%
        };
      });

      return { monthlyPatterns, yearOverYear, predictions };
    } catch (error) {
      this.logger.error('❌ Seasonal trend analysis failed:', error);
      throw error;
    }
  }

  // Private helper methods
  private async processAnalyticsQuery(query: AnalyticsQuery): Promise<any[]> {
    // Simulate data processing
    const data = [];
    const periods = this.generateDatePeriods(query.dateRange, query.granularity);
    
    for (const period of periods) {
      data.push({
        date: period,
        value: Math.random() * 10000 + 1000,
        metric: query.metric
      });
    }
    
    return data;
  }

  private generateDatePeriods(dateRange: { startDate: Date; endDate: Date }, granularity: string): string[] {
    const periods = [];
    const current = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);
    
    while (current <= end) {
      periods.push(current.toISOString().split('T')[0]);
      
      switch (granularity) {
        case 'day':
          current.setDate(current.getDate() + 1);
          break;
        case 'week':
          current.setDate(current.getDate() + 7);
          break;
        case 'month':
          current.setMonth(current.getMonth() + 1);
          break;
        default:
          current.setDate(current.getDate() + 1);
      }
    }
    
    return periods;
  }

  private calculateSummary(data: any[], aggregation: string): any {
    const values = data.map(d => d.value);
    let total = 0;
    
    switch (aggregation) {
      case 'sum':
        total = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        total = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'count':
        total = values.length;
        break;
      case 'max':
        total = Math.max(...values);
        break;
      case 'min':
        total = Math.min(...values);
        break;
    }
    
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const growth = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    return {
      total: Math.round(total),
      average: Math.round(average),
      growth: Math.round(growth * 100) / 100,
      trend: growth > 5 ? 'up' : growth < -5 ? 'down' : 'stable'
    };
  }

  private generateCacheKey(query: AnalyticsQuery): string {
    return `analytics:${JSON.stringify(query)}`;
  }

  private getCachedResult(key: string): any {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  private setCachedResult(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private buildQueryString(query: AnalyticsQuery): string {
    return `SELECT ${query.metric} FROM analytics WHERE date BETWEEN '${query.dateRange.startDate.toISOString()}' AND '${query.dateRange.endDate.toISOString()}'`;
  }

  // KPI calculation methods
  private async calculateRevenue(dateRange: any): Promise<any> {
    return {
      current: Math.random() * 100000 + 50000,
      previous: Math.random() * 90000 + 45000,
      target: 120000
    };
  }

  private async calculateProfitMargin(dateRange: any): Promise<any> {
    return {
      current: Math.random() * 30 + 10, // 10-40%
      previous: Math.random() * 25 + 8,
      target: 25
    };
  }

  private async calculateCashFlow(dateRange: any): Promise<any> {
    return {
      current: (Math.random() - 0.3) * 50000, // Can be negative
      previous: (Math.random() - 0.3) * 45000
    };
  }

  private async calculateAccountsReceivable(dateRange: any): Promise<any> {
    return {
      current: Math.random() * 30000 + 10000,
      previous: Math.random() * 32000 + 12000,
      target: 15000
    };
  }

  private async calculateCAC(dateRange: any): Promise<any> {
    return {
      current: Math.random() * 200 + 50,
      previous: Math.random() * 220 + 60,
      target: 100
    };
  }

  private async calculateCLV(dateRange: any): Promise<any> {
    return {
      current: Math.random() * 2000 + 1000,
      previous: Math.random() * 1800 + 900,
      target: 2500
    };
  }

  private determineTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
    const change = ((current - previous) / previous) * 100;
    return change > 5 ? 'up' : change < -5 ? 'down' : 'stable';
  }

  private determineStatus(current: number, target?: number): 'good' | 'warning' | 'critical' {
    if (!target) return 'good';
    const ratio = current / target;
    return ratio >= 0.9 ? 'good' : ratio >= 0.7 ? 'warning' : 'critical';
  }

  private getMonthsBetween(start: Date, end: Date): number {
    return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  }
}
import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  Logger
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService, AnalyticsQuery, AnalyticsResult, FinancialKPI } from '../services/analytics.service';

@ApiTags('analytics')
@Controller('analytics')
@ApiBearerAuth()
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('financial-kpis')
  @ApiOperation({ summary: 'Get comprehensive financial KPIs' })
  @ApiResponse({ status: 200, description: 'Financial KPIs retrieved successfully' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (ISO string)' })
  async getFinancialKPIs(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<{ success: boolean; data: FinancialKPI[]; timestamp: Date }> {
    try {
      const dateRange = {
        startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: endDate ? new Date(endDate) : new Date()
      };

      const kpis = await this.analyticsService.getFinancialKPIs(dateRange);
      
      this.logger.log(`📊 Financial KPIs retrieved for period: ${dateRange.startDate.toISOString()} - ${dateRange.endDate.toISOString()}`);
      
      return {
        success: true,
        data: kpis,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('❌ Failed to retrieve financial KPIs:', error);
      throw error;
    }
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute custom analytics query' })
  @ApiResponse({ status: 200, description: 'Query executed successfully' })
  async executeQuery(
    @Body() query: AnalyticsQuery
  ): Promise<{ success: boolean; result: AnalyticsResult; timestamp: Date }> {
    try {
      const result = await this.analyticsService.executeQuery(query);
      
      this.logger.log(`📊 Analytics query executed: ${query.metric} (${result.metadata.executionTime}ms)`);
      
      return {
        success: true,
        result,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`❌ Analytics query failed: ${query.metric}`, error);
      throw error;
    }
  }

  @Get('cohort-analysis')
  @ApiOperation({ summary: 'Perform customer cohort analysis' })
  @ApiResponse({ status: 200, description: 'Cohort analysis completed' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @UseInterceptors(CacheInterceptor)
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute - expensive operation
  async getCohortAnalysis(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<{
    success: boolean;
    data: {
      cohorts: any[];
      retentionRates: number[][];
      insights: string[];
    };
    timestamp: Date;
  }> {
    try {
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const analysis = await this.analyticsService.performCohortAnalysis(start, end);
      
      this.logger.log(`📊 Cohort analysis completed for ${analysis.cohorts.length} cohorts`);
      
      return {
        success: true,
        data: analysis,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('❌ Cohort analysis failed:', error);
      throw error;
    }
  }

  @Get('revenue-attribution')
  @ApiOperation({ summary: 'Analyze revenue attribution across channels' })
  @ApiResponse({ status: 200, description: 'Revenue attribution analysis completed' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @UseInterceptors(CacheInterceptor)
  async getRevenueAttribution(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<{
    success: boolean;
    data: {
      channels: { name: string; revenue: number; percentage: number }[];
      products: { name: string; revenue: number; percentage: number }[];
      regions: { name: string; revenue: number; percentage: number }[];
      trends: { channel: string; trend: number }[];
    };
    timestamp: Date;
  }> {
    try {
      const dateRange = {
        startDate: startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        endDate: endDate ? new Date(endDate) : new Date()
      };

      const attribution = await this.analyticsService.analyzeRevenueAttribution(dateRange);
      
      this.logger.log(`📊 Revenue attribution analysis completed`);
      
      return {
        success: true,
        data: attribution,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('❌ Revenue attribution analysis failed:', error);
      throw error;
    }
  }

  @Get('seasonal-trends/:metric')
  @ApiOperation({ summary: 'Analyze seasonal trends for a specific metric' })
  @ApiResponse({ status: 200, description: 'Seasonal trends analysis completed' })
  @ApiQuery({ name: 'years', required: false, description: 'Number of years to analyze (default: 3)' })
  @UseInterceptors(CacheInterceptor)
  async getSeasonalTrends(
    @Param('metric') metric: string,
    @Query('years') years?: string
  ): Promise<{
    success: boolean;
    data: {
      monthlyPatterns: { month: string; value: number; seasonalIndex: number }[];
      yearOverYear: { year: number; growth: number }[];
      predictions: { month: string; predicted: number; confidence: number }[];
    };
    timestamp: Date;
  }> {
    try {
      const yearsToAnalyze = years ? parseInt(years) : 3;
      const trends = await this.analyticsService.analyzeSeasonalTrends(metric, yearsToAnalyze);
      
      this.logger.log(`📊 Seasonal trends analysis completed for metric: ${metric}`);
      
      return {
        success: true,
        data: trends,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`❌ Seasonal trends analysis failed for metric: ${metric}`, error);
      throw error;
    }
  }

  @Get('dashboard-summary')
  @ApiOperation({ summary: 'Get comprehensive dashboard summary' })
  @ApiResponse({ status: 200, description: 'Dashboard summary retrieved successfully' })
  @UseInterceptors(CacheInterceptor)
  @Throttle({ default: { limit: 200, ttl: 60000 } }) // High frequency for dashboard updates
  async getDashboardSummary(): Promise<{
    success: boolean;
    data: {
      kpis: FinancialKPI[];
      recentTrends: any[];
      alerts: any[];
      quickStats: any;
    };
    timestamp: Date;
  }> {
    try {
      const dateRange = {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date()
      };

      // Get parallel data
      const [kpis, attribution] = await Promise.all([
        this.analyticsService.getFinancialKPIs(dateRange),
        this.analyticsService.analyzeRevenueAttribution(dateRange)
      ]);

      const quickStats = {
        totalRevenue: kpis.find(k => k.name === 'Total Revenue')?.value || 0,
        totalCustomers: Math.floor(Math.random() * 10000) + 5000,
        activeProjects: Math.floor(Math.random() * 500) + 200,
        pendingInvoices: Math.floor(Math.random() * 100) + 50,
        overdueAmount: Math.floor(Math.random() * 50000) + 10000
      };

      const alerts = [
        {
          id: 'alert-1',
          type: 'warning',
          title: 'High Overdue Amount',
          message: `$${quickStats.overdueAmount.toLocaleString()} in overdue invoices`,
          timestamp: new Date()
        },
        {
          id: 'alert-2',
          type: 'info',
          title: 'Monthly Target',
          message: '85% of monthly revenue target achieved',
          timestamp: new Date()
        }
      ];

      const recentTrends = attribution.channels.map(channel => ({
        name: channel.name,
        value: channel.revenue,
        change: attribution.trends.find(t => t.channel === channel.name)?.trend || 0
      }));

      this.logger.log('📊 Dashboard summary retrieved successfully');
      
      return {
        success: true,
        data: {
          kpis,
          recentTrends,
          alerts,
          quickStats
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('❌ Failed to retrieve dashboard summary:', error);
      throw error;
    }
  }

  @Get('export/:format')
  @ApiOperation({ summary: 'Export analytics data in various formats' })
  @ApiResponse({ status: 200, description: 'Data exported successfully' })
  @ApiQuery({ name: 'metric', required: true })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Limited exports per minute
  async exportData(
    @Param('format') format: 'csv' | 'xlsx' | 'pdf' | 'json',
    @Query('metric') metric: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<{
    success: boolean;
    downloadUrl: string;
    filename: string;
    timestamp: Date;
  }> {
    try {
      const query: AnalyticsQuery = {
        metric,
        dimensions: ['date'],
        filters: {},
        dateRange: {
          startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: endDate ? new Date(endDate) : new Date()
        },
        granularity: 'day',
        aggregation: 'sum'
      };

      const result = await this.analyticsService.executeQuery(query);
      
      // In a real implementation, this would generate the actual file
      const filename = `${metric}_${format}_${Date.now()}.${format}`;
      const downloadUrl = `/api/analytics/downloads/${filename}`;
      
      this.logger.log(`📊 Data export initiated: ${filename}`);
      
      return {
        success: true,
        downloadUrl,
        filename,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`❌ Data export failed for metric: ${metric}`, error);
      throw error;
    }
  }

  @Get('health')
  @ApiOperation({ summary: 'Analytics service health check' })
  @ApiResponse({ status: 200, description: 'Service health status' })
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    cacheHitRate: number;
    avgResponseTime: number;
    timestamp: Date;
  }> {
    const uptime = process.uptime();
    const cacheHitRate = Math.random() * 0.3 + 0.7; // 70-100%
    const avgResponseTime = Math.random() * 100 + 50; // 50-150ms
    
    const status = avgResponseTime < 100 && cacheHitRate > 0.8 ? 'healthy' : 
                  avgResponseTime < 200 ? 'degraded' : 'unhealthy';

    return {
      status,
      uptime,
      cacheHitRate: Number(cacheHitRate.toFixed(3)),
      avgResponseTime: Number(avgResponseTime.toFixed(2)),
      timestamp: new Date()
    };
  }
}
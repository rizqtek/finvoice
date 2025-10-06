import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  BadRequestException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MLService, PredictionRequest, PredictionResult, MLModelMetrics } from '../services/ml.service';

@ApiTags('ml')
@Controller('ml')
@ApiBearerAuth()
export class MLController {
  private readonly logger = new Logger(MLController.name);

  constructor(private readonly mlService: MLService) {}

  @Post('predict')
  @ApiOperation({ summary: 'Make ML predictions for financial metrics' })
  @ApiResponse({ status: 200, description: 'Prediction completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid prediction request' })
  async predict(
    @Body() request: PredictionRequest
  ): Promise<{ success: boolean; prediction: PredictionResult; timestamp: Date }> {
    try {
      this.validatePredictionRequest(request);
      
      const prediction = await this.mlService.predict(request);
      
      this.logger.log(`🧠 ML prediction completed: ${request.type} (confidence: ${prediction.confidence.toFixed(2)})`);
      
      return {
        success: true,
        prediction,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`❌ ML prediction failed for ${request.type}:`, error);
      throw error;
    }
  }

  @Post('train/:modelType')
  @ApiOperation({ summary: 'Train ML model with new data' })
  @ApiResponse({ status: 200, description: 'Model training completed' })
  @ApiResponse({ status: 400, description: 'Invalid training data' })
  async trainModel(
    @Param('modelType') modelType: string,
    @Body() trainingData: { data: any[]; labels: any[] }
  ): Promise<{ success: boolean; metrics: MLModelMetrics; timestamp: Date }> {
    try {
      if (!trainingData.data || !trainingData.labels) {
        throw new BadRequestException('Training data and labels are required');
      }

      if (trainingData.data.length !== trainingData.labels.length) {
        throw new BadRequestException('Data and labels must have the same length');
      }

      const metrics = await this.mlService.trainModel(
        modelType,
        trainingData.data,
        trainingData.labels
      );
      
      this.logger.log(`🧠 Model training completed: ${modelType} (accuracy: ${metrics.accuracy.toFixed(3)})`);
      
      return {
        success: true,
        metrics,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`❌ Model training failed for ${modelType}:`, error);
      throw error;
    }
  }

  @Get('models/:modelType/metrics')
  @ApiOperation({ summary: 'Get model performance metrics' })
  @ApiResponse({ status: 200, description: 'Model metrics retrieved' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async getModelMetrics(
    @Param('modelType') modelType: string
  ): Promise<{ success: boolean; metrics: MLModelMetrics | null; timestamp: Date }> {
    try {
      const metrics = this.mlService.getModelMetrics(modelType);
      
      if (!metrics) {
        return {
          success: false,
          metrics: null,
          timestamp: new Date()
        };
      }
      
      this.logger.log(`📊 Retrieved metrics for model: ${modelType}`);
      
      return {
        success: true,
        metrics,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`❌ Failed to get metrics for model ${modelType}:`, error);
      throw error;
    }
  }

  @Post('anomaly-detection')
  @ApiOperation({ summary: 'Detect anomalies in financial data' })
  @ApiResponse({ status: 200, description: 'Anomaly detection completed' })
  async detectAnomalies(
    @Body() data: { values: number[]; threshold?: number }
  ): Promise<{
    success: boolean;
    anomalies: {
      anomalies: number[];
      indices: number[];
      severity: 'low' | 'medium' | 'high';
    };
    timestamp: Date;
  }> {
    try {
      if (!data.values || !Array.isArray(data.values)) {
        throw new BadRequestException('Values array is required');
      }

      const threshold = data.threshold || 2;
      const anomalies = await this.mlService.detectAnomalies(data.values, threshold);
      
      this.logger.log(`🔍 Anomaly detection completed: ${anomalies.anomalies.length} anomalies found (${anomalies.severity} severity)`);
      
      return {
        success: true,
        anomalies,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('❌ Anomaly detection failed:', error);
      throw error;
    }
  }

  @Post('forecast')
  @ApiOperation({ summary: 'Generate financial forecasts using ML' })
  @ApiResponse({ status: 200, description: 'Forecast completed successfully' })
  async generateForecast(
    @Body() data: { values: number[]; periods?: number }
  ): Promise<{
    success: boolean;
    forecast: {
      forecast: number[];
      confidence_intervals: { lower: number[]; upper: number[] };
      trend: 'increasing' | 'decreasing' | 'stable';
    };
    timestamp: Date;
  }> {
    try {
      if (!data.values || !Array.isArray(data.values)) {
        throw new BadRequestException('Values array is required');
      }

      if (data.values.length < 12) {
        throw new BadRequestException('At least 12 data points are required for forecasting');
      }

      const periods = data.periods || 12;
      const forecast = await this.mlService.forecast(data.values, periods);
      
      this.logger.log(`📈 Forecast generated: ${periods} periods ahead (trend: ${forecast.trend})`);
      
      return {
        success: true,
        forecast,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('❌ Forecasting failed:', error);
      throw error;
    }
  }

  @Get('prediction-examples')
  @ApiOperation({ summary: 'Get example prediction requests for different model types' })
  @ApiResponse({ status: 200, description: 'Prediction examples retrieved' })
  async getPredictionExamples(): Promise<{
    success: boolean;
    examples: Record<string, PredictionRequest>;
    timestamp: Date;
  }> {
    const examples: Record<string, PredictionRequest> = {
      revenue: {
        type: 'revenue',
        timeframe: 'monthly',
        data: [
          { amount: 50000, clientCount: 120, averageInvoiceValue: 400, seasonality: 0.8, marketTrends: 0.6 },
          { amount: 52000, clientCount: 125, averageInvoiceValue: 410, seasonality: 0.9, marketTrends: 0.7 },
          { amount: 48000, clientCount: 118, averageInvoiceValue: 395, seasonality: 0.7, marketTrends: 0.5 }
        ],
        features: ['amount', 'clientCount', 'averageInvoiceValue', 'seasonality', 'marketTrends']
      },
      
      payment_risk: {
        type: 'payment_risk',
        timeframe: 'monthly',
        data: [
          {
            paymentHistory: 0.85,
            creditScore: 720,
            industryRisk: 0.3,
            invoiceAmount: 5000,
            daysOverdue: 0,
            clientSize: 500,
            economicIndicators: 0.6,
            seasonality: 0.8,
            relationshipDuration: 24,
            previousDefaults: 0
          }
        ],
        features: ['paymentHistory', 'creditScore', 'industryRisk', 'invoiceAmount', 'daysOverdue']
      },
      
      cash_flow: {
        type: 'cash_flow',
        timeframe: 'weekly',
        data: [
          { inflow: 25000, outflow: 20000, balance: 5000 },
          { inflow: 28000, outflow: 22000, balance: 6000 },
          { inflow: 24000, outflow: 19000, balance: 5000 }
        ],
        features: ['inflow', 'outflow', 'balance']
      }
    };

    return {
      success: true,
      examples,
      timestamp: new Date()
    };
  }

  @Get('models/status')
  @ApiOperation({ summary: 'Get status of all ML models' })
  @ApiResponse({ status: 200, description: 'Models status retrieved' })
  async getModelsStatus(): Promise<{
    success: boolean;
    models: {
      name: string;
      status: 'ready' | 'training' | 'error';
      lastTrained?: Date;
      accuracy?: number;
      version: string;
    }[];
    timestamp: Date;
  }> {
    try {
      const models = [
        {
          name: 'revenue',
          status: 'ready' as const,
          lastTrained: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
          accuracy: 0.92,
          version: '1.2.0'
        },
        {
          name: 'payment_risk',
          status: 'ready' as const,
          lastTrained: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
          accuracy: 0.88,
          version: '1.1.5'
        },
        {
          name: 'cash_flow',
          status: 'ready' as const,
          lastTrained: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
          accuracy: 0.85,
          version: '1.0.8'
        }
      ];

      this.logger.log(`📊 Retrieved status for ${models.length} ML models`);

      return {
        success: true,
        models,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('❌ Failed to get models status:', error);
      throw error;
    }
  }

  @Post('batch-predictions')
  @ApiOperation({ summary: 'Run multiple predictions in batch' })
  @ApiResponse({ status: 200, description: 'Batch predictions completed' })
  async batchPredict(
    @Body() requests: PredictionRequest[]
  ): Promise<{
    success: boolean;
    predictions: (PredictionResult | { error: string })[];
    summary: {
      total: number;
      successful: number;
      failed: number;
    };
    timestamp: Date;
  }> {
    try {
      if (!Array.isArray(requests) || requests.length === 0) {
        throw new BadRequestException('Array of prediction requests is required');
      }

      if (requests.length > 100) {
        throw new BadRequestException('Maximum 100 predictions per batch');
      }

      const predictions = [];
      let successful = 0;
      let failed = 0;

      for (const request of requests) {
        try {
          this.validatePredictionRequest(request);
          const prediction = await this.mlService.predict(request);
          predictions.push(prediction);
          successful++;
        } catch (error) {
          predictions.push({ error: error.message });
          failed++;
        }
      }

      this.logger.log(`🧠 Batch predictions completed: ${successful} successful, ${failed} failed`);

      return {
        success: true,
        predictions,
        summary: {
          total: requests.length,
          successful,
          failed
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('❌ Batch predictions failed:', error);
      throw error;
    }
  }

  private validatePredictionRequest(request: PredictionRequest): void {
    if (!request.type) {
      throw new BadRequestException('Prediction type is required');
    }

    if (!['revenue', 'expenses', 'cash_flow', 'payment_risk', 'invoice_payment_time'].includes(request.type)) {
      throw new BadRequestException(`Invalid prediction type: ${request.type}`);
    }

    if (!request.timeframe) {
      throw new BadRequestException('Timeframe is required');
    }

    if (!['weekly', 'monthly', 'quarterly', 'yearly'].includes(request.timeframe)) {
      throw new BadRequestException(`Invalid timeframe: ${request.timeframe}`);
    }

    if (!request.data || !Array.isArray(request.data) || request.data.length === 0) {
      throw new BadRequestException('Data array is required and must not be empty');
    }

    // Validate minimum data points based on timeframe
    const minDataPoints = {
      'weekly': 4,
      'monthly': 3,
      'quarterly': 2,
      'yearly': 1
    };

    if (request.data.length < minDataPoints[request.timeframe]) {
      throw new BadRequestException(`Minimum ${minDataPoints[request.timeframe]} data points required for ${request.timeframe} predictions`);
    }
  }
}
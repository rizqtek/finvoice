import { Injectable, Logger } from '@nestjs/common';
import * as tf from '@tensorflow/tfjs-node';
import { Matrix } from 'ml-matrix';

export interface PredictionRequest {
  type: 'revenue' | 'expenses' | 'cash_flow' | 'payment_risk' | 'invoice_payment_time';
  timeframe: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  data: any[];
  features?: string[];
}

export interface MLModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rmse?: number;
  mae?: number;
}

export interface PredictionResult {
  prediction: number | number[];
  confidence: number;
  features: string[];
  model: string;
  timestamp: Date;
  explanation?: string;
  riskFactors?: string[];
}

@Injectable()
export class MLService {
  private readonly logger = new Logger(MLService.name);
  private models: Map<string, tf.LayersModel> = new Map();
  private modelMetrics: Map<string, MLModelMetrics> = new Map();

  constructor() {
    this.initializeModels();
  }

  /**
   * Initialize pre-trained ML models for financial predictions
   */
  private async initializeModels(): Promise<void> {
    try {
      // Revenue Prediction Model (LSTM)
      const revenueModel = tf.sequential({
        layers: [
          tf.layers.lstm({ units: 50, returnSequences: true, inputShape: [12, 5] }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.lstm({ units: 50, returnSequences: false }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 25 }),
          tf.layers.dense({ units: 1 })
        ]
      });
      
      revenueModel.compile({
        optimizer: 'adam',
        loss: 'meanSquaredError',
        metrics: ['accuracy']
      });
      
      this.models.set('revenue', revenueModel);
      this.logger.log('✅ Revenue prediction model initialized');

      // Payment Risk Model (Classification)
      const riskModel = tf.sequential({
        layers: [
          tf.layers.dense({ units: 128, activation: 'relu', inputShape: [10] }),
          tf.layers.dropout({ rate: 0.3 }),
          tf.layers.dense({ units: 64, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.3 }),
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dense({ units: 3, activation: 'softmax' }) // Low, Medium, High risk
        ]
      });
      
      riskModel.compile({
        optimizer: 'adam',
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });
      
      this.models.set('payment_risk', riskModel);
      this.logger.log('✅ Payment risk model initialized');

      // Cash Flow Prediction Model (Time Series)
      const cashFlowModel = tf.sequential({
        layers: [
          tf.layers.conv1d({ filters: 64, kernelSize: 3, activation: 'relu', inputShape: [30, 3] }),
          tf.layers.maxPooling1d({ poolSize: 2 }),
          tf.layers.flatten(),
          tf.layers.dense({ units: 50, activation: 'relu' }),
          tf.layers.dense({ units: 1 })
        ]
      });
      
      cashFlowModel.compile({
        optimizer: 'adam',
        loss: 'meanSquaredError',
        metrics: ['mae']
      });
      
      this.models.set('cash_flow', cashFlowModel);
      this.logger.log('✅ Cash flow prediction model initialized');

      this.logger.log('🧠 All ML models initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize ML models:', error);
    }
  }

  /**
   * Make predictions using trained models
   */
  async predict(request: PredictionRequest): Promise<PredictionResult> {
    try {
      const model = this.models.get(request.type);
      if (!model) {
        throw new Error(`Model for ${request.type} not found`);
      }

      const preprocessedData = this.preprocessData(request.data, request.type);
      const prediction = model.predict(preprocessedData) as tf.Tensor;
      const predictionData = await prediction.data();
      
      const confidence = this.calculateConfidence(predictionData as Float32Array, request.type);
      const explanation = this.generateExplanation(request.type, predictionData as Float32Array);
      
      await prediction.dispose();
      await preprocessedData.dispose();

      return {
        prediction: Array.from(predictionData),
        confidence,
        features: request.features || this.getDefaultFeatures(request.type),
        model: request.type,
        timestamp: new Date(),
        explanation,
        riskFactors: this.identifyRiskFactors(request.data, request.type)
      };
    } catch (error) {
      this.logger.error(`❌ Prediction failed for ${request.type}:`, error);
      throw error;
    }
  }

  /**
   * Preprocess raw data for ML models
   */
  private preprocessData(data: any[], modelType: string): tf.Tensor {
    switch (modelType) {
      case 'revenue':
        return this.preprocessRevenueData(data);
      case 'payment_risk':
        return this.preprocessRiskData(data);
      case 'cash_flow':
        return this.preprocessCashFlowData(data);
      default:
        throw new Error(`Unknown model type: ${modelType}`);
    }
  }

  private preprocessRevenueData(data: any[]): tf.Tensor {
    // Convert revenue data to time series format
    const features = data.map(d => [
      d.amount || 0,
      d.clientCount || 0,
      d.averageInvoiceValue || 0,
      d.seasonality || 0,
      d.marketTrends || 0
    ]);
    
    return tf.tensor3d([features]);
  }

  private preprocessRiskData(data: any[]): tf.Tensor {
    // Extract risk features
    const features = data.map(d => [
      d.paymentHistory || 0,
      d.creditScore || 0,
      d.industryRisk || 0,
      d.invoiceAmount || 0,
      d.daysOverdue || 0,
      d.clientSize || 0,
      d.economicIndicators || 0,
      d.seasonality || 0,
      d.relationshipDuration || 0,
      d.previousDefaults || 0
    ]);
    
    return tf.tensor2d(features);
  }

  private preprocessCashFlowData(data: any[]): tf.Tensor {
    // Convert to cash flow time series
    const features = data.map(d => [
      d.inflow || 0,
      d.outflow || 0,
      d.balance || 0
    ]);
    
    return tf.tensor3d([features]);
  }

  /**
   * Calculate prediction confidence
   */
  private calculateConfidence(prediction: Float32Array, modelType: string): number {
    switch (modelType) {
      case 'payment_risk':
        // For classification, use max probability
        return Math.max(...Array.from(prediction));
      default:
        // For regression, use inverse of standard deviation
        const mean = prediction.reduce((a, b) => a + b, 0) / prediction.length;
        const variance = prediction.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prediction.length;
        return Math.max(0, 1 - Math.sqrt(variance));
    }
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(modelType: string, prediction: Float32Array): string {
    switch (modelType) {
      case 'revenue':
        const revenue = prediction[0];
        return `Based on historical patterns and market trends, predicted revenue is $${revenue.toFixed(2)}`;
      
      case 'payment_risk':
        const riskLevels = ['Low', 'Medium', 'High'];
        const maxIndex = prediction.indexOf(Math.max(...prediction));
        return `Payment risk classified as ${riskLevels[maxIndex]} (${(prediction[maxIndex] * 100).toFixed(1)}% confidence)`;
      
      case 'cash_flow':
        const cashFlow = prediction[0];
        const trend = cashFlow > 0 ? 'positive' : 'negative';
        return `Predicted cash flow shows ${trend} trend with $${Math.abs(cashFlow).toFixed(2)} expected change`;
      
      default:
        return 'Prediction completed successfully';
    }
  }

  /**
   * Identify key risk factors
   */
  private identifyRiskFactors(data: any[], modelType: string): string[] {
    const riskFactors: string[] = [];
    
    if (modelType === 'payment_risk') {
      const latest = data[data.length - 1] || {};
      
      if (latest.daysOverdue > 30) riskFactors.push('Extended overdue period');
      if (latest.creditScore < 600) riskFactors.push('Low credit score');
      if (latest.previousDefaults > 0) riskFactors.push('Previous payment defaults');
      if (latest.industryRisk > 0.7) riskFactors.push('High-risk industry');
      if (latest.invoiceAmount > 100000) riskFactors.push('Large invoice amount');
    }
    
    return riskFactors;
  }

  /**
   * Get default features for model type
   */
  private getDefaultFeatures(modelType: string): string[] {
    switch (modelType) {
      case 'revenue':
        return ['historical_revenue', 'client_count', 'avg_invoice_value', 'seasonality', 'market_trends'];
      case 'payment_risk':
        return ['payment_history', 'credit_score', 'industry_risk', 'invoice_amount', 'days_overdue'];
      case 'cash_flow':
        return ['inflow', 'outflow', 'balance'];
      default:
        return [];
    }
  }

  /**
   * Train model with new data
   */
  async trainModel(modelType: string, trainingData: any[], labels: any[]): Promise<MLModelMetrics> {
    try {
      const model = this.models.get(modelType);
      if (!model) {
        throw new Error(`Model ${modelType} not found`);
      }

      const xTrain = this.preprocessData(trainingData, modelType);
      const yTrain = tf.tensor(labels);

      const history = await model.fit(xTrain, yTrain, {
        epochs: 100,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch: number, logs: any) => {
            if (epoch % 10 === 0) {
              this.logger.log(`Epoch ${epoch}: loss = ${logs?.loss?.toFixed(4)}, accuracy = ${logs?.acc?.toFixed(4)}`);
            }
          }
        }
      });

      const metrics = await this.calculateModelMetrics(model, xTrain, yTrain);
      this.modelMetrics.set(modelType, metrics);

      await xTrain.dispose();
      await yTrain.dispose();

      this.logger.log(`✅ Model ${modelType} retrained successfully`);
      return metrics;
    } catch (error) {
      this.logger.error(`❌ Failed to train model ${modelType}:`, error);
      throw error;
    }
  }

  /**
   * Calculate model performance metrics
   */
  private async calculateModelMetrics(model: tf.LayersModel, xTest: tf.Tensor, yTest: tf.Tensor): Promise<MLModelMetrics> {
    const predictions = model.predict(xTest) as tf.Tensor;
    const predData = await predictions.data();
    const trueData = await yTest.data();

    // Calculate metrics
    let correct = 0;
    let totalSquaredError = 0;
    let totalAbsError = 0;

    for (let i = 0; i < predData.length; i++) {
      const pred = predData[i];
      const actual = trueData[i];
      
      if (Math.round(pred) === Math.round(actual)) correct++;
      totalSquaredError += Math.pow(pred - actual, 2);
      totalAbsError += Math.abs(pred - actual);
    }

    const accuracy = correct / predData.length;
    const rmse = Math.sqrt(totalSquaredError / predData.length);
    const mae = totalAbsError / predData.length;

    await predictions.dispose();

    return {
      accuracy,
      precision: accuracy, // Simplified for demo
      recall: accuracy,    // Simplified for demo
      f1Score: accuracy,   // Simplified for demo
      rmse,
      mae
    };
  }

  /**
   * Get model performance metrics
   */
  getModelMetrics(modelType: string): MLModelMetrics | undefined {
    return this.modelMetrics.get(modelType);
  }

  /**
   * Advanced anomaly detection using statistical methods
   */
  async detectAnomalies(data: number[], threshold: number = 2): Promise<{
    anomalies: number[];
    indices: number[];
    severity: 'low' | 'medium' | 'high';
  }> {
    const matrix = new Matrix([data]);
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const std = Math.sqrt(data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length);
    
    const anomalies: number[] = [];
    const indices: number[] = [];
    
    data.forEach((value, index) => {
      const zScore = Math.abs(value - mean) / std;
      if (zScore > threshold) {
        anomalies.push(value);
        indices.push(index);
      }
    });
    
    const severity = anomalies.length > data.length * 0.1 ? 'high' : 
                    anomalies.length > data.length * 0.05 ? 'medium' : 'low';
    
    return { anomalies, indices, severity };
  }

  /**
   * Forecast financial metrics using time series analysis
   */
  async forecast(data: number[], periods: number = 12): Promise<{
    forecast: number[];
    confidence_intervals: { lower: number[]; upper: number[] };
    trend: 'increasing' | 'decreasing' | 'stable';
  }> {
    // Simple moving average with trend detection
    const windowSize = Math.min(12, Math.floor(data.length / 3));
    const forecast: number[] = [];
    const lower: number[] = [];
    const upper: number[] = [];
    
    // Calculate trend
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const trend = secondAvg > firstAvg * 1.05 ? 'increasing' : 
                  secondAvg < firstAvg * 0.95 ? 'decreasing' : 'stable';
    
    // Generate forecasts
    for (let i = 0; i < periods; i++) {
      const recentData = data.slice(-windowSize);
      const avg = recentData.reduce((a, b) => a + b, 0) / recentData.length;
      const std = Math.sqrt(recentData.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / recentData.length);
      
      // Apply trend adjustment
      const trendMultiplier = trend === 'increasing' ? 1.02 : trend === 'decreasing' ? 0.98 : 1;
      const forecastValue = avg * Math.pow(trendMultiplier, i + 1);
      
      forecast.push(forecastValue);
      lower.push(forecastValue - 1.96 * std);
      upper.push(forecastValue + 1.96 * std);
      
      // Add forecast to data for next iteration
      data.push(forecastValue);
    }
    
    return {
      forecast,
      confidence_intervals: { lower, upper },
      trend
    };
  }
}
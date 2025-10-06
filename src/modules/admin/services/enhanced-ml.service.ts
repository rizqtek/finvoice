// Enhanced AI/ML Integration Service for Finvoice Admin System
import { Injectable, Logger } from '@nestjs/common';
import * as tf from '@tensorflow/tfjs-node';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument } from '../schemas/user.schema';
import { AuditLogDocument } from '../schemas/audit-log.schema';
import { RealtimeEventService } from '../gateways/admin-realtime.gateway';

export interface UserBehaviorPrediction {
  userId: string;
  predictedActions: Array<{
    action: string;
    probability: number;
    timing: Date;
  }>;
  riskScore: number;
  recommendations: string[];
}

export interface SecurityAnomalyDetection {
  userId: string;
  anomalyType: 'login_pattern' | 'access_pattern' | 'permission_usage' | 'data_access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
  suggestedActions: string[];
}

export interface SystemInsight {
  type: 'performance' | 'security' | 'usage' | 'optimization';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
  recommendations: string[];
  metrics: Record<string, number>;
}

@Injectable()
export class EnhancedMLService {
  private readonly logger = new Logger(EnhancedMLService.name);
  private userBehaviorModel: tf.LayersModel;
  private anomalyDetectionModel: tf.LayersModel;
  private predictiveAnalyticsModel: tf.LayersModel;
  private isInitialized = false;

  constructor(
    @InjectModel('User') private userModel: Model<UserDocument>,
    @InjectModel('AuditLog') private auditModel: Model<AuditLogDocument>,
    private realtimeEventService: RealtimeEventService,
  ) {}

  async initializeML() {
    try {
      this.logger.log('Initializing ML models...');

      // Initialize user behavior prediction model
      await this.createUserBehaviorModel();
      
      // Initialize anomaly detection model
      await this.createAnomalyDetectionModel();
      
      // Initialize predictive analytics model
      await this.createPredictiveAnalyticsModel();

      this.isInitialized = true;
      this.logger.log('ML models initialized successfully');

      // Start background analysis
      this.startBackgroundAnalysis();

    } catch (error) {
      this.logger.error('Failed to initialize ML models', error);
    }
  }

  private async createUserBehaviorModel() {
    // Create a neural network for user behavior prediction
    this.userBehaviorModel = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [20], units: 64, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 16, activation: 'relu' }),
        tf.layers.dense({ units: 8, activation: 'softmax' }) // 8 possible actions
      ]
    });

    this.userBehaviorModel.compile({
      optimizer: 'adam',
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    this.logger.log('User behavior model created');
  }

  private async createAnomalyDetectionModel() {
    // Create an autoencoder for anomaly detection
    const encoder = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [15], units: 10, activation: 'relu' }),
        tf.layers.dense({ units: 5, activation: 'relu' }),
        tf.layers.dense({ units: 3, activation: 'relu' })
      ]
    });

    const decoder = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [3], units: 5, activation: 'relu' }),
        tf.layers.dense({ units: 10, activation: 'relu' }),
        tf.layers.dense({ units: 15, activation: 'sigmoid' })
      ]
    });

    this.anomalyDetectionModel = tf.sequential({
      layers: [...encoder.layers, ...decoder.layers]
    });

    this.anomalyDetectionModel.compile({
      optimizer: 'adam',
      loss: 'meanSquaredError'
    });

    this.logger.log('Anomaly detection model created');
  }

  private async createPredictiveAnalyticsModel() {
    // Create a model for system performance and usage predictions
    this.predictiveAnalyticsModel = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [12], units: 24, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 12, activation: 'relu' }),
        tf.layers.dense({ units: 6, activation: 'relu' }),
        tf.layers.dense({ units: 3, activation: 'linear' }) // Predict 3 metrics
      ]
    });

    this.predictiveAnalyticsModel.compile({
      optimizer: 'adam',
      loss: 'meanSquaredError',
      metrics: ['mae']
    });

    this.logger.log('Predictive analytics model created');
  }

  async predictUserBehavior(userId: string): Promise<UserBehaviorPrediction> {
    if (!this.isInitialized) {
      throw new Error('ML service not initialized');
    }

    try {
      // Get user's historical data
      const userHistory = await this.getUserHistoricalData(userId);
      const features = this.extractUserFeatures(userHistory);

      // Make prediction
      const inputTensor = tf.tensor2d([features]);
      const prediction = this.userBehaviorModel.predict(inputTensor) as tf.Tensor;
      const probabilities = await prediction.data();

      // Map probabilities to actions
      const actions = [
        'login', 'logout', 'view_dashboard', 'manage_users', 
        'export_data', 'change_settings', 'view_reports', 'security_action'
      ];

      const predictedActions = actions.map((action, index) => ({
        action,
        probability: probabilities[index],
        timing: this.predictActionTiming(action, probabilities[index])
      })).sort((a, b) => b.probability - a.probability);

      // Calculate risk score
      const riskScore = this.calculateUserRiskScore(userHistory, predictedActions);

      // Generate recommendations
      const recommendations = this.generateUserRecommendations(predictedActions, riskScore);

      inputTensor.dispose();
      prediction.dispose();

      return {
        userId,
        predictedActions: predictedActions.slice(0, 3), // Top 3 predictions
        riskScore,
        recommendations
      };

    } catch (error) {
      this.logger.error(`Error predicting user behavior for ${userId}`, error);
      throw error;
    }
  }

  async detectSecurityAnomalies(userId?: string): Promise<SecurityAnomalyDetection[]> {
    if (!this.isInitialized) {
      throw new Error('ML service not initialized');
    }

    try {
      const anomalies: SecurityAnomalyDetection[] = [];
      
      // Get recent activity data
      const query = userId ? { userId } : {};
      const recentActivity = await this.auditModel
        .find(query)
        .sort({ timestamp: -1 })
        .limit(1000)
        .exec();

      // Group by user for analysis
      const userActivities = this.groupActivitiesByUser(recentActivity);

      for (const [currentUserId, activities] of userActivities.entries()) {
        const features = this.extractAnomalyFeatures(activities);
        
        if (features.length === 0) continue;

        const inputTensor = tf.tensor2d([features]);
        const reconstruction = this.anomalyDetectionModel.predict(inputTensor) as tf.Tensor;
        
        // Calculate reconstruction error
        const originalData = await inputTensor.data();
        const reconstructedData = await reconstruction.data();
        
        const error = this.calculateReconstructionError(
          Array.from(originalData), 
          Array.from(reconstructedData)
        );

        // Threshold for anomaly detection
        const threshold = 0.1;
        
        if (error > threshold) {
          const anomaly = await this.classifyAnomaly(currentUserId, activities, error);
          anomalies.push(anomaly);

          // Send real-time alert
          this.realtimeEventService.emitSecurityEvent(
            `Anomaly detected for user ${currentUserId}`,
            { anomaly },
            anomaly.severity
          );
        }

        inputTensor.dispose();
        reconstruction.dispose();
      }

      return anomalies;

    } catch (error) {
      this.logger.error('Error detecting security anomalies', error);
      throw error;
    }
  }

  async generateSystemInsights(): Promise<SystemInsight[]> {
    if (!this.isInitialized) {
      throw new Error('ML service not initialized');
    }

    try {
      const insights: SystemInsight[] = [];

      // Performance insights
      const performanceInsights = await this.analyzeSystemPerformance();
      insights.push(...performanceInsights);

      // Security insights
      const securityInsights = await this.analyzeSecurityTrends();
      insights.push(...securityInsights);

      // Usage insights
      const usageInsights = await this.analyzeUsagePatterns();
      insights.push(...usageInsights);

      // Optimization insights
      const optimizationInsights = await this.generateOptimizationRecommendations();
      insights.push(...optimizationInsights);

      // Sort by impact
      insights.sort((a, b) => {
        const impactOrder = { high: 3, medium: 2, low: 1 };
        return impactOrder[b.impact] - impactOrder[a.impact];
      });

      return insights;

    } catch (error) {
      this.logger.error('Error generating system insights', error);
      throw error;
    }
  }

  async predictSystemLoad(hoursAhead: number = 24): Promise<{
    predictions: Array<{
      timestamp: Date;
      expectedLoad: number;
      confidence: number;
    }>;
    recommendations: string[];
  }> {
    if (!this.isInitialized) {
      throw new Error('ML service not initialized');
    }

    try {
      // Get historical system metrics
      const historicalData = await this.getSystemHistoricalData();
      const features = this.extractSystemFeatures(historicalData);

      const predictions = [];
      const now = new Date();

      for (let i = 1; i <= hoursAhead; i++) {
        const inputTensor = tf.tensor2d([features]);
        const prediction = this.predictiveAnalyticsModel.predict(inputTensor) as tf.Tensor;
        const results = await prediction.data();

        const timestamp = new Date(now.getTime() + i * 60 * 60 * 1000);
        const expectedLoad = results[0]; // First output is load prediction
        const confidence = Math.min(results[1], 1.0); // Second output is confidence

        predictions.push({
          timestamp,
          expectedLoad: Math.max(0, Math.min(100, expectedLoad * 100)), // Normalize to 0-100%
          confidence: confidence * 100
        });

        inputTensor.dispose();
        prediction.dispose();
      }

      // Generate recommendations based on predictions
      const recommendations = this.generateLoadRecommendations(predictions);

      return { predictions, recommendations };

    } catch (error) {
      this.logger.error('Error predicting system load', error);
      throw error;
    }
  }

  // AI-powered auto-scaling recommendations
  async generateAutoScalingRecommendations(): Promise<{
    action: 'scale_up' | 'scale_down' | 'maintain';
    confidence: number;
    reasoning: string;
    metrics: Record<string, number>;
  }> {
    try {
      const systemMetrics = await this.getCurrentSystemMetrics();
      const loadPrediction = await this.predictSystemLoad(6); // 6 hours ahead
      
      const avgPredictedLoad = loadPrediction.predictions.reduce(
        (sum, pred) => sum + pred.expectedLoad, 0
      ) / loadPrediction.predictions.length;

      let action: 'scale_up' | 'scale_down' | 'maintain';
      let confidence: number;
      let reasoning: string;

      if (avgPredictedLoad > 80) {
        action = 'scale_up';
        confidence = 0.9;
        reasoning = 'High load predicted in next 6 hours, scaling up recommended';
      } else if (avgPredictedLoad < 30 && systemMetrics.currentLoad < 40) {
        action = 'scale_down';
        confidence = 0.7;
        reasoning = 'Low load predicted and current usage is low, scaling down possible';
      } else {
        action = 'maintain';
        confidence = 0.8;
        reasoning = 'Current scaling appears optimal for predicted load';
      }

      return {
        action,
        confidence,
        reasoning,
        metrics: {
          currentLoad: systemMetrics.currentLoad,
          predictedLoad: avgPredictedLoad,
          memoryUsage: systemMetrics.memoryUsage,
          cpuUsage: systemMetrics.cpuUsage
        }
      };

    } catch (error) {
      this.logger.error('Error generating auto-scaling recommendations', error);
      throw error;
    }
  }

  private startBackgroundAnalysis() {
    // Run anomaly detection every 15 minutes
    setInterval(async () => {
      try {
        await this.detectSecurityAnomalies();
      } catch (error) {
        this.logger.error('Background anomaly detection failed', error);
      }
    }, 15 * 60 * 1000);

    // Generate insights every hour
    setInterval(async () => {
      try {
        const insights = await this.generateSystemInsights();
        
        // Send high-impact insights as real-time notifications
        insights
          .filter(insight => insight.impact === 'high' && insight.actionable)
          .forEach(insight => {
            this.realtimeEventService.emitSystemAlert(
              `${insight.title}: ${insight.description}`,
              'info'
            );
          });

      } catch (error) {
        this.logger.error('Background insight generation failed', error);
      }
    }, 60 * 60 * 1000);

    this.logger.log('Background ML analysis started');
  }

  // Helper methods (simplified implementations)
  private async getUserHistoricalData(userId: string) {
    return this.auditModel
      .find({ userId })
      .sort({ timestamp: -1 })
      .limit(500)
      .exec();
  }

  private extractUserFeatures(activities: any[]): number[] {
    // Extract 20 features from user activities
    const features = new Array(20).fill(0);
    
    if (activities.length === 0) return features;

    // Time-based features
    const hours = activities.map(a => new Date(a.timestamp).getHours());
    features[0] = this.calculateMode(hours); // Most common hour
    features[1] = activities.length; // Activity count
    
    // Action type distribution
    const actionTypes = activities.map(a => a.action);
    const uniqueActions = [...new Set(actionTypes)];
    features[2] = uniqueActions.length; // Action diversity
    
    // Add more sophisticated feature extraction...
    return features.slice(0, 20);
  }

  private extractAnomalyFeatures(activities: any[]): number[] {
    // Extract 15 features for anomaly detection
    const features = new Array(15).fill(0);
    
    if (activities.length === 0) return [];

    // Basic activity patterns
    features[0] = activities.length;
    features[1] = new Set(activities.map(a => a.action)).size;
    features[2] = this.calculateActivityRate(activities);
    
    // Add more features...
    return features;
  }

  private extractSystemFeatures(historicalData: any[]): number[] {
    // Extract 12 features for system predictions
    const features = new Array(12).fill(0);
    
    // Add system-level feature extraction...
    return features;
  }

  private calculateMode(arr: number[]): number {
    const frequency: Record<number, number> = {};
    let maxCount = 0;
    let mode = 0;
    
    arr.forEach(val => {
      frequency[val] = (frequency[val] || 0) + 1;
      if (frequency[val] > maxCount) {
        maxCount = frequency[val];
        mode = val;
      }
    });
    
    return mode;
  }

  private calculateActivityRate(activities: any[]): number {
    if (activities.length < 2) return 0;
    
    const timeSpan = new Date(activities[0].timestamp).getTime() - 
                    new Date(activities[activities.length - 1].timestamp).getTime();
    
    return activities.length / (timeSpan / (1000 * 60 * 60)); // Activities per hour
  }

  private groupActivitiesByUser(activities: any[]): Map<string, any[]> {
    const grouped = new Map();
    
    activities.forEach(activity => {
      const userId = activity.userId?.toString() || 'anonymous';
      if (!grouped.has(userId)) {
        grouped.set(userId, []);
      }
      grouped.get(userId).push(activity);
    });
    
    return grouped;
  }

  private calculateReconstructionError(original: number[], reconstructed: number[]): number {
    if (original.length !== reconstructed.length) return 1;
    
    const mse = original.reduce((sum, val, i) => 
      sum + Math.pow(val - reconstructed[i], 2), 0) / original.length;
    
    return Math.sqrt(mse);
  }

  private async classifyAnomaly(userId: string, activities: any[], error: number): Promise<SecurityAnomalyDetection> {
    // Simplified anomaly classification
    const anomalyTypes = ['login_pattern', 'access_pattern', 'permission_usage', 'data_access'];
    const type = anomalyTypes[Math.floor(Math.random() * anomalyTypes.length)];
    
    const severity = error > 0.3 ? 'high' : error > 0.2 ? 'medium' : 'low';
    
    return {
      userId,
      anomalyType: type as any,
      severity: severity as any,
      description: `Unusual ${type.replace('_', ' ')} detected for user ${userId}`,
      confidence: Math.min(error * 10, 1),
      suggestedActions: [
        'Review user activities',
        'Verify user identity',
        'Check for unauthorized access'
      ]
    };
  }

  private predictActionTiming(action: string, probability: number): Date {
    // Predict when action might occur based on probability and historical patterns
    const hoursAhead = Math.max(1, Math.floor((1 - probability) * 24));
    return new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  }

  private calculateUserRiskScore(userHistory: any[], predictedActions: any[]): number {
    // Simplified risk calculation
    const baseRisk = 0.1;
    const historyFactor = Math.min(userHistory.length / 100, 1);
    const predictionFactor = predictedActions.reduce((sum, action) => 
      sum + (action.action.includes('security') ? action.probability * 0.5 : 0), 0);
    
    return Math.min(baseRisk + historyFactor * 0.3 + predictionFactor, 1);
  }

  private generateUserRecommendations(predictedActions: any[], riskScore: number): string[] {
    const recommendations = [];
    
    if (riskScore > 0.7) {
      recommendations.push('Enable additional monitoring for this user');
      recommendations.push('Consider requiring MFA for sensitive actions');
    }
    
    if (predictedActions[0]?.action === 'security_action') {
      recommendations.push('Prepare security resources for potential user requests');
    }
    
    return recommendations;
  }

  // Additional helper methods would be implemented here...
  private async analyzeSystemPerformance(): Promise<SystemInsight[]> { return []; }
  private async analyzeSecurityTrends(): Promise<SystemInsight[]> { return []; }
  private async analyzeUsagePatterns(): Promise<SystemInsight[]> { return []; }
  private async generateOptimizationRecommendations(): Promise<SystemInsight[]> { return []; }
  private async getSystemHistoricalData(): Promise<any[]> { return []; }
  private generateLoadRecommendations(predictions: any[]): string[] { return []; }
  private async getCurrentSystemMetrics(): Promise<any> { return {}; }
}
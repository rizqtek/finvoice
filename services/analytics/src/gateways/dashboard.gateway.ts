import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtAuthGuard } from '../../../../src/shared/guards/jwt-auth.guard';

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'metric' | 'table' | 'gauge' | 'map';
  title: string;
  data: any;
  config: any;
  lastUpdated: Date;
}

export interface RealTimeMetric {
  name: string;
  value: number;
  change: number;
  timestamp: Date;
  trend: 'up' | 'down' | 'stable';
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  namespace: '/dashboard',
})
export class DashboardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DashboardGateway.name);
  private connectedClients = new Map<string, { socket: Socket; userId: string; subscriptions: Set<string> }>();
  private activeSubscriptions = new Map<string, Set<string>>(); // metric -> clientIds
  private metricsCache = new Map<string, RealTimeMetric>();

  constructor() {
    // Start real-time data simulation
    this.startRealTimeDataSimulation();
  }

  async handleConnection(client: Socket) {
    try {
      // Extract user info from token (simplified for demo)
      const token = client.handshake.auth.token;
      const userId = this.extractUserIdFromToken(token);
      
      this.connectedClients.set(client.id, {
        socket: client,
        userId,
        subscriptions: new Set()
      });

      this.logger.log(`📱 Client connected: ${client.id} (User: ${userId})`);
      
      // Send initial dashboard data
      client.emit('dashboard:connected', {
        message: 'Connected to real-time dashboard',
        timestamp: new Date(),
        availableMetrics: this.getAvailableMetrics()
      });

    } catch (error) {
      this.logger.error(`❌ Connection failed for client ${client.id}:`, error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      // Clean up subscriptions
      clientInfo.subscriptions.forEach(metric => {
        const subscribers = this.activeSubscriptions.get(metric);
        if (subscribers) {
          subscribers.delete(client.id);
          if (subscribers.size === 0) {
            this.activeSubscriptions.delete(metric);
          }
        }
      });
      
      this.connectedClients.delete(client.id);
      this.logger.log(`📱 Client disconnected: ${client.id}`);
    }
  }

  @SubscribeMessage('dashboard:subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { metrics: string[]; dashboardId?: string }
  ) {
    try {
      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo) return;

      // Add subscriptions
      data.metrics.forEach(metric => {
        clientInfo.subscriptions.add(metric);
        
        if (!this.activeSubscriptions.has(metric)) {
          this.activeSubscriptions.set(metric, new Set());
        }
        this.activeSubscriptions.get(metric)?.add(client.id);
      });

      // Send current values
      const currentValues = data.metrics.map(metric => ({
        metric,
        data: this.metricsCache.get(metric) || this.generateMetricData(metric)
      }));

      client.emit('dashboard:subscribed', {
        metrics: data.metrics,
        currentValues,
        timestamp: new Date()
      });

      this.logger.log(`📊 Client ${client.id} subscribed to: ${data.metrics.join(', ')}`);
    } catch (error) {
      this.logger.error(`❌ Subscription failed for client ${client.id}:`, error);
      client.emit('dashboard:error', { message: 'Subscription failed', error: error.message });
    }
  }

  @SubscribeMessage('dashboard:unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { metrics: string[] }
  ) {
    const clientInfo = this.connectedClients.get(client.id);
    if (!clientInfo) return;

    data.metrics.forEach(metric => {
      clientInfo.subscriptions.delete(metric);
      
      const subscribers = this.activeSubscriptions.get(metric);
      if (subscribers) {
        subscribers.delete(client.id);
        if (subscribers.size === 0) {
          this.activeSubscriptions.delete(metric);
        }
      }
    });

    client.emit('dashboard:unsubscribed', {
      metrics: data.metrics,
      timestamp: new Date()
    });

    this.logger.log(`📊 Client ${client.id} unsubscribed from: ${data.metrics.join(', ')}`);
  }

  @SubscribeMessage('dashboard:getWidgets')
  async handleGetWidgets(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { dashboardId: string }
  ) {
    try {
      const widgets = await this.generateDashboardWidgets(data.dashboardId);
      
      client.emit('dashboard:widgets', {
        dashboardId: data.dashboardId,
        widgets,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error(`❌ Failed to get widgets for client ${client.id}:`, error);
      client.emit('dashboard:error', { message: 'Failed to load widgets', error: error.message });
    }
  }

  @SubscribeMessage('dashboard:updateWidget')
  async handleUpdateWidget(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { widgetId: string; config: any }
  ) {
    try {
      // Update widget configuration
      await this.updateWidgetConfig(data.widgetId, data.config);
      
      // Broadcast update to all clients viewing this dashboard
      this.server.emit('dashboard:widgetUpdated', {
        widgetId: data.widgetId,
        config: data.config,
        timestamp: new Date()
      });

      this.logger.log(`📊 Widget ${data.widgetId} updated by client ${client.id}`);
    } catch (error) {
      this.logger.error(`❌ Failed to update widget for client ${client.id}:`, error);
      client.emit('dashboard:error', { message: 'Failed to update widget', error: error.message });
    }
  }

  /**
   * Broadcast real-time metric updates to subscribed clients
   */
  broadcastMetricUpdate(metric: string, data: RealTimeMetric): void {
    const subscribers = this.activeSubscriptions.get(metric);
    if (!subscribers || subscribers.size === 0) return;

    // Cache the metric data
    this.metricsCache.set(metric, data);

    // Broadcast to all subscribers
    subscribers.forEach(clientId => {
      const clientInfo = this.connectedClients.get(clientId);
      if (clientInfo) {
        clientInfo.socket.emit('dashboard:metricUpdate', {
          metric,
          data,
          timestamp: new Date()
        });
      }
    });

    this.logger.debug(`📊 Broadcasted ${metric} update to ${subscribers.size} clients`);
  }

  /**
   * Broadcast alert to all connected clients
   */
  broadcastAlert(alert: {
    id: string;
    type: 'warning' | 'error' | 'info' | 'success';
    title: string;
    message: string;
    data?: any;
  }): void {
    this.server.emit('dashboard:alert', {
      ...alert,
      timestamp: new Date()
    });

    this.logger.log(`🚨 Broadcasted alert: ${alert.title}`);
  }

  /**
   * Send system status update
   */
  broadcastSystemStatus(status: {
    status: 'healthy' | 'degraded' | 'down';
    services: { name: string; status: string; latency?: number }[];
    message?: string;
  }): void {
    this.server.emit('dashboard:systemStatus', {
      ...status,
      timestamp: new Date()
    });

    this.logger.log(`💻 Broadcasted system status: ${status.status}`);
  }

  /**
   * Start real-time data simulation
   */
  private startRealTimeDataSimulation(): void {
    const metrics = this.getAvailableMetrics();
    
    // Update metrics every 5 seconds
    setInterval(() => {
      metrics.forEach(metric => {
        const data = this.generateMetricData(metric);
        this.broadcastMetricUpdate(metric, data);
      });
    }, 5000);

    // Send random alerts every 30 seconds
    setInterval(() => {
      if (Math.random() > 0.7) { // 30% chance
        this.broadcastRandomAlert();
      }
    }, 30000);

    this.logger.log('🔄 Real-time data simulation started');
  }

  private generateMetricData(metric: string): RealTimeMetric {
    const baseValues: Record<string, number> = {
      'revenue': 50000,
      'orders': 150,
      'customers': 1200,
      'conversion_rate': 3.5,
      'avg_order_value': 350,
      'cash_flow': 25000,
      'expenses': 30000,
      'profit_margin': 15,
      'customer_satisfaction': 4.2
    };

    const baseValue = baseValues[metric] || 100;
    const variance = 0.1; // 10% variance
    const change = (Math.random() - 0.5) * variance * 2;
    const value = baseValue * (1 + change);
    
    return {
      name: metric,
      value: Number(value.toFixed(2)),
      change: Number((change * 100).toFixed(2)),
      timestamp: new Date(),
      trend: change > 0.02 ? 'up' : change < -0.02 ? 'down' : 'stable'
    };
  }

  private getAvailableMetrics(): string[] {
    return [
      'revenue',
      'orders',
      'customers',
      'conversion_rate',
      'avg_order_value',
      'cash_flow',
      'expenses',
      'profit_margin',
      'customer_satisfaction'
    ];
  }

  private async generateDashboardWidgets(dashboardId: string): Promise<DashboardWidget[]> {
    // Generate sample widgets based on dashboard type
    const widgets: DashboardWidget[] = [
      {
        id: 'revenue-chart',
        type: 'chart',
        title: 'Revenue Trend',
        data: this.generateChartData('revenue', 30),
        config: {
          chartType: 'line',
          timeRange: '30d',
          color: '#4CAF50'
        },
        lastUpdated: new Date()
      },
      {
        id: 'kpi-metrics',
        type: 'metric',
        title: 'Key Metrics',
        data: {
          metrics: [
            { name: 'Total Revenue', value: '$52,450', change: '+12.5%', trend: 'up' },
            { name: 'New Customers', value: '1,247', change: '+8.2%', trend: 'up' },
            { name: 'Conversion Rate', value: '3.4%', change: '-2.1%', trend: 'down' },
            { name: 'Avg Order Value', value: '$356', change: '+5.7%', trend: 'up' }
          ]
        },
        config: {
          layout: 'grid',
          showTrends: true
        },
        lastUpdated: new Date()
      },
      {
        id: 'top-products',
        type: 'table',
        title: 'Top Products',
        data: {
          headers: ['Product', 'Revenue', 'Units Sold', 'Growth'],
          rows: [
            ['Premium Plan', '$25,000', '125', '+15%'],
            ['Standard Plan', '$18,500', '220', '+8%'],
            ['Basic Plan', '$8,950', '350', '+3%']
          ]
        },
        config: {
          sortable: true,
          pageSize: 10
        },
        lastUpdated: new Date()
      },
      {
        id: 'cash-flow-gauge',
        type: 'gauge',
        title: 'Cash Flow Health',
        data: {
          value: 75,
          max: 100,
          thresholds: [
            { value: 30, color: '#f44336' },
            { value: 60, color: '#ff9800' },
            { value: 100, color: '#4caf50' }
          ]
        },
        config: {
          unit: '%',
          showValue: true
        },
        lastUpdated: new Date()
      }
    ];

    return widgets;
  }

  private generateChartData(metric: string, days: number): any {
    const data = [];
    const labels = [];
    
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      labels.push(date.toISOString().split('T')[0]);
      
      const baseValue = 1000;
      const trend = 0.02; // 2% growth trend
      const noise = (Math.random() - 0.5) * 200;
      const value = baseValue + (days - i) * trend * baseValue + noise;
      
      data.push(Math.round(value));
    }
    
    return { labels, data };
  }

  private async updateWidgetConfig(widgetId: string, config: any): Promise<void> {
    // In a real implementation, this would update the database
    this.logger.log(`📊 Updated widget ${widgetId} config:`, config);
  }

  private extractUserIdFromToken(token: string): string {
    // Simplified token extraction - in production, use proper JWT verification
    return token ? `user_${Math.random().toString(36).substr(2, 9)}` : 'anonymous';
  }

  private broadcastRandomAlert(): void {
    const alerts = [
      {
        id: `alert_${Date.now()}`,
        type: 'warning' as const,
        title: 'High Server Load',
        message: 'Server CPU usage is above 80%'
      },
      {
        id: `alert_${Date.now()}`,
        type: 'info' as const,
        title: 'Payment Processed',
        message: 'Large payment of $50,000 received'
      },
      {
        id: `alert_${Date.now()}`,
        type: 'success' as const,
        title: 'Milestone Reached',
        message: 'Monthly revenue target achieved!'
      }
    ];

    const randomAlert = alerts[Math.floor(Math.random() * alerts.length)];
    this.broadcastAlert(randomAlert);
  }
}
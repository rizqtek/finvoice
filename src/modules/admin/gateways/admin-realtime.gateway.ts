// Real-time WebSocket Gateway for Admin System
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AdminNotification {
  id: string;
  type: 'user_action' | 'system_alert' | 'security_event' | 'performance_warning';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  timestamp: Date;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface SystemMetrics {
  timestamp: Date;
  cpu: number;
  memory: number;
  disk: number;
  activeUsers: number;
  requests: number;
  errors: number;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/admin',
})
export class AdminRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AdminRealtimeGateway.name);
  private connectedClients = new Map<string, Socket>();
  private userSockets = new Map<string, Set<string>>();

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      // Store client connection
      this.connectedClients.set(client.id, client);
      
      // Map user to socket
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.add(client.id);
      }

      // Join admin room for broadcasting
      client.join('admin_room');

      this.logger.log(`Admin client connected: ${client.id} (User: ${userId})`);

      // Send welcome message with current system status
      client.emit('admin_connected', {
        message: 'Connected to admin real-time updates',
        timestamp: new Date(),
        connectedClients: this.connectedClients.size,
      });

    } catch (error) {
      this.logger.error('Authentication failed for WebSocket connection', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    
    // Remove from user socket mapping
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
        break;
      }
    }

    this.logger.log(`Admin client disconnected: ${client.id}`);
  }

  // Real-time notification broadcasting
  broadcastNotification(notification: AdminNotification) {
    this.server.to('admin_room').emit('admin_notification', notification);
    this.logger.log(`Broadcasted notification: ${notification.type} - ${notification.title}`);
  }

  // Real-time system metrics broadcasting
  broadcastSystemMetrics(metrics: SystemMetrics) {
    this.server.to('admin_room').emit('system_metrics', metrics);
  }

  // Send notification to specific user
  sendToUser(userId: string, event: string, data: any) {
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.forEach(socketId => {
        const socket = this.connectedClients.get(socketId);
        if (socket) {
          socket.emit(event, data);
        }
      });
    }
  }

  // Handle client requests for real-time data
  @SubscribeMessage('request_system_status')
  handleSystemStatusRequest(@ConnectedSocket() client: Socket) {
    // This would fetch current system status and send it back
    const status = {
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      connectedClients: this.connectedClients.size,
      activeUsers: this.userSockets.size,
    };
    
    client.emit('system_status', status);
  }

  @SubscribeMessage('subscribe_to_user_activity')
  handleUserActivitySubscription(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`user_activity_${data.userId}`);
    this.logger.log(`Client ${client.id} subscribed to user activity: ${data.userId}`);
  }

  @SubscribeMessage('unsubscribe_from_user_activity')
  handleUserActivityUnsubscription(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`user_activity_${data.userId}`);
    this.logger.log(`Client ${client.id} unsubscribed from user activity: ${data.userId}`);
  }

  // Broadcast user activity
  broadcastUserActivity(userId: string, activity: any) {
    this.server.to(`user_activity_${userId}`).emit('user_activity', {
      userId,
      activity,
      timestamp: new Date(),
    });
  }

  // Real-time audit log streaming
  @SubscribeMessage('subscribe_to_audit_logs')
  handleAuditLogSubscription(@ConnectedSocket() client: Socket) {
    client.join('audit_logs');
    this.logger.log(`Client ${client.id} subscribed to audit logs`);
  }

  @SubscribeMessage('unsubscribe_from_audit_logs')
  handleAuditLogUnsubscription(@ConnectedSocket() client: Socket) {
    client.leave('audit_logs');
    this.logger.log(`Client ${client.id} unsubscribed from audit logs`);
  }

  broadcastAuditLog(auditLog: any) {
    this.server.to('audit_logs').emit('new_audit_log', {
      log: auditLog,
      timestamp: new Date(),
    });
  }

  // Real-time performance monitoring
  @SubscribeMessage('subscribe_to_performance')
  handlePerformanceSubscription(@ConnectedSocket() client: Socket) {
    client.join('performance');
    this.logger.log(`Client ${client.id} subscribed to performance metrics`);
  }

  broadcastPerformanceMetrics(metrics: any) {
    this.server.to('performance').emit('performance_metrics', {
      metrics,
      timestamp: new Date(),
    });
  }

  // Security alerts
  broadcastSecurityAlert(alert: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    details: any;
  }) {
    this.server.to('admin_room').emit('security_alert', {
      ...alert,
      timestamp: new Date(),
      id: `alert_${Date.now()}`,
    });
  }

  // Connection status
  getConnectionStatus() {
    return {
      connectedClients: this.connectedClients.size,
      activeUsers: this.userSockets.size,
      rooms: ['admin_room', 'audit_logs', 'performance'],
    };
  }
}

// Real-time Metrics Collection Service
@Injectable()
export class RealtimeMetricsService {
  private readonly logger = new Logger(RealtimeMetricsService.name);
  private metricsInterval: NodeJS.Timeout;

  constructor(private adminGateway: AdminRealtimeGateway) {}

  startMetricsCollection() {
    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.collectSystemMetrics();
        this.adminGateway.broadcastSystemMetrics(metrics);
      } catch (error) {
        this.logger.error('Error collecting metrics', error);
      }
    }, 5000); // Every 5 seconds

    this.logger.log('Real-time metrics collection started');
  }

  stopMetricsCollection() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.logger.log('Real-time metrics collection stopped');
    }
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      timestamp: new Date(),
      cpu: this.calculateCpuPercent(cpuUsage),
      memory: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      disk: await this.getDiskUsage(),
      activeUsers: this.adminGateway.getConnectionStatus().activeUsers,
      requests: await this.getRequestCount(),
      errors: await this.getErrorCount(),
    };
  }

  private calculateCpuPercent(cpuUsage: NodeJS.CpuUsage): number {
    const totalUsage = cpuUsage.user + cpuUsage.system;
    return (totalUsage / 1000000) % 100; // Convert to percentage
  }

  private async getDiskUsage(): Promise<number> {
    // Simplified disk usage calculation
    // In production, you might use a more sophisticated method
    return Math.random() * 100; // Placeholder
  }

  private async getRequestCount(): Promise<number> {
    // This would typically come from your monitoring system
    return Math.floor(Math.random() * 1000);
  }

  private async getErrorCount(): Promise<number> {
    // This would typically come from your error tracking system
    return Math.floor(Math.random() * 10);
  }
}

// Real-time Event Emitter Service
@Injectable()
export class RealtimeEventService {
  private readonly logger = new Logger(RealtimeEventService.name);

  constructor(private adminGateway: AdminRealtimeGateway) {}

  emitUserAction(userId: string, action: string, details: any) {
    const notification: AdminNotification = {
      id: `user_action_${Date.now()}`,
      type: 'user_action',
      title: 'User Action',
      message: `User performed action: ${action}`,
      severity: 'info',
      timestamp: new Date(),
      userId,
      metadata: details,
    };

    this.adminGateway.broadcastNotification(notification);
    this.adminGateway.broadcastUserActivity(userId, { action, details });
  }

  emitSystemAlert(message: string, severity: 'info' | 'warning' | 'error' | 'success' = 'info') {
    const notification: AdminNotification = {
      id: `system_alert_${Date.now()}`,
      type: 'system_alert',
      title: 'System Alert',
      message,
      severity,
      timestamp: new Date(),
    };

    this.adminGateway.broadcastNotification(notification);
  }

  emitSecurityEvent(event: string, details: any, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium') {
    const notification: AdminNotification = {
      id: `security_event_${Date.now()}`,
      type: 'security_event',
      title: 'Security Event',
      message: event,
      severity: severity === 'critical' ? 'error' : 'warning',
      timestamp: new Date(),
      metadata: details,
    };

    this.adminGateway.broadcastNotification(notification);
    this.adminGateway.broadcastSecurityAlert({
      type: event,
      severity,
      message: event,
      details,
    });
  }

  emitAuditLog(auditLog: any) {
    this.adminGateway.broadcastAuditLog(auditLog);
  }

  emitPerformanceWarning(metric: string, value: number, threshold: number) {
    const notification: AdminNotification = {
      id: `perf_warning_${Date.now()}`,
      type: 'performance_warning',
      title: 'Performance Warning',
      message: `${metric} is ${value.toFixed(2)}% (threshold: ${threshold}%)`,
      severity: 'warning',
      timestamp: new Date(),
      metadata: { metric, value, threshold },
    };

    this.adminGateway.broadcastNotification(notification);
  }
}
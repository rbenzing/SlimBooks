// Logging middleware for Slimbooks
// Handles request logging, performance monitoring, and audit trails

import { type Request, type Response, type NextFunction } from 'express';
import { loggingConfig } from '../config/index.js';

interface RequestInfo {
  timestamp: string;
  method: string;
  url: string;
  ip: string;
  userAgent?: string;
  contentLength?: string;
  referer?: string;
  statusCode?: number;
  duration?: number;
  responseSize?: number;
}

interface LogEntry {
  timestamp: string;
  event?: string;
  details?: Record<string, unknown>;
  level?: string;
  operation?: string;
  table?: string;
}

interface SecurityLogEntry extends LogEntry {
  event: string;
  level: 'SECURITY';
}

interface UserActivityLogEntry extends LogEntry {
  action: string;
  userId: number;
  level: 'USER_ACTIVITY';
}

interface DBLogEntry extends LogEntry {
  operation: string;
  table: string;
}

interface PerformanceMetrics {
  requests: number;
  totalDuration: number;
  slowRequests: number;
  errors: number;
}

/**
 * Request logging middleware
 * Logs all incoming requests with timing information
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  if (!loggingConfig.enableRequestLogging) {
    return next();
  }
  
  const start = Date.now();
  const originalSend = res.send.bind(res);
  
  // Capture request details
  const userAgent = req.get('User-Agent');
  const contentLength = req.get('Content-Length');
  const referer = req.get('Referer');
  
  const requestInfo: RequestInfo = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    ...(userAgent && { userAgent }),
    ...(contentLength && { contentLength }),
    ...(referer && { referer })
  };
  
  // Override res.send to capture response details
  res.send = function(data: unknown): Response {
    const duration = Date.now() - start;
    const responseSize = Buffer.isBuffer(data) ? data.length : Buffer.byteLength((data as string) || '', 'utf8');
    
    // Log request completion
    logRequest({
      ...requestInfo,
      userAgent: requestInfo.userAgent || 'unknown',
      contentLength: requestInfo.contentLength || '0',
      referer: requestInfo.referer || '-',
      statusCode: res.statusCode,
      duration,
      responseSize
    });
    
    // Call original send method
    return originalSend(data);
  };
  
  next();
};

/**
 * Log request details
 */
const logRequest = (info: Required<RequestInfo>): void => {
  const { timestamp, method, url, ip, statusCode, duration, responseSize } = info;
  
  // Color code based on status
  const statusColor = getStatusColor(statusCode);
  const durationColor = getDurationColor(duration);
  
  console.log(
    `${timestamp} ${statusColor}${statusCode}\x1b[0m ${method} ${url} ` +
    `${durationColor}${duration}ms\x1b[0m ${formatBytes(responseSize)} ${ip}`
  );
  
  // Log slow requests
  if (duration > 1000) {
    console.warn(`⚠️  Slow request detected: ${method} ${url} took ${duration}ms`);
  }
  
  // TODO: Write to log file if file logging is enabled
  // writeToAccessLog(info);
};

/**
 * Get color code for HTTP status
 */
const getStatusColor = (status: number): string => {
  if (status >= 500) return '\x1b[31m'; // Red
  if (status >= 400) return '\x1b[33m'; // Yellow
  if (status >= 300) return '\x1b[36m'; // Cyan
  if (status >= 200) return '\x1b[32m'; // Green
  return '\x1b[0m'; // Default
};

/**
 * Get color code for request duration
 */
const getDurationColor = (duration: number): string => {
  if (duration > 1000) return '\x1b[31m'; // Red (slow)
  if (duration > 500) return '\x1b[33m';  // Yellow (moderate)
  return '\x1b[32m'; // Green (fast)
};

/**
 * Format bytes to human readable format
 */
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * Security audit logging middleware
 * Logs security-related events
 */
export const securityLogger = (event: string, details: Record<string, unknown> = {}): void => {
  const _logEntry: SecurityLogEntry = {
    timestamp: new Date().toISOString(),
    event,
    details,
    level: 'SECURITY'
  };
  
  console.log(`🔒 SECURITY: ${event}`, details);
  
  // TODO: Send to security monitoring system
  // sendToSecurityMonitoring(logEntry);
};

/**
 * Database operation logging middleware
 * Logs database queries and operations
 */
export const dbLogger = (operation: string, table: string, details: Record<string, unknown> = {}): void => {
  if (loggingConfig.level !== 'debug') {
    return;
  }
  
  const _logEntry: DBLogEntry = {
    timestamp: new Date().toISOString(),
    operation,
    table,
    details
  };
  
  console.log(`📊 DB: ${operation} on ${table}`, details);
};

/**
 * Performance monitoring middleware
 * Tracks application performance metrics
 */
export const performanceMonitor = () => {
  const metrics: PerformanceMetrics = {
    requests: 0,
    totalDuration: 0,
    slowRequests: 0,
    errors: 0
  };
  
  // Log metrics every 5 minutes
  setInterval(() => {
    if (metrics.requests > 0) {
      const avgDuration = metrics.totalDuration / metrics.requests;
      console.log(`📈 Performance metrics (5min): ${metrics.requests} requests, ` +
                 `avg ${avgDuration.toFixed(2)}ms, ${metrics.slowRequests} slow, ${metrics.errors} errors`);
      
      // Reset metrics
      Object.keys(metrics).forEach(key => {
        metrics[key as keyof PerformanceMetrics] = 0;
      });
    }
  }, 5 * 60 * 1000);
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      metrics.requests++;
      metrics.totalDuration += duration;
      
      if (duration > 1000) {
        metrics.slowRequests++;
      }
      
      if (res.statusCode >= 400) {
        metrics.errors++;
      }
    });
    
    next();
  };
};

/**
 * User activity logging
 * Logs user actions for audit trails
 */
export const userActivityLogger = (action: string, userId: number, details: Record<string, unknown> = {}): void => {
  const _logEntry: UserActivityLogEntry = {
    timestamp: new Date().toISOString(),
    action,
    userId,
    details,
    level: 'USER_ACTIVITY'
  };
  
  console.log(`👤 USER: ${action} by user ${userId}`, details);
  
  // TODO: Store in audit log table
  // storeUserActivity(logEntry);
};

/**
 * API endpoint usage tracking
 * Tracks which endpoints are being used
 */
export const endpointTracker = () => {
  const endpointStats = new Map<string, number>();
  
  // Log endpoint usage every hour
  setInterval(() => {
    if (endpointStats.size > 0) {
      console.log('📊 Endpoint usage (1hr):');
      const sorted = Array.from(endpointStats.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      sorted.forEach(([endpoint, count]) => {
        console.log(`  ${endpoint}: ${count} requests`);
      });
      
      endpointStats.clear();
    }
  }, 60 * 60 * 1000);
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    endpointStats.set(endpoint, (endpointStats.get(endpoint) || 0) + 1);
    next();
  };
};

/**
 * Error rate monitoring
 * Tracks error rates and alerts on high error rates
 */
export const errorRateMonitor = () => {
  const errorWindow: boolean[] = [];
  const windowSize = 100; // Track last 100 requests
  const errorThreshold = 0.1; // Alert if error rate > 10%
  
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      const isError = res.statusCode >= 400;
      errorWindow.push(isError);
      
      // Keep window size
      if (errorWindow.length > windowSize) {
        errorWindow.shift();
      }
      
      // Check error rate
      if (errorWindow.length >= windowSize) {
        const errorCount = errorWindow.filter(Boolean).length;
        const errorRate = errorCount / windowSize;
        
        if (errorRate > errorThreshold) {
          console.warn(`🚨 High error rate detected: ${(errorRate * 100).toFixed(1)}% (${errorCount}/${windowSize})`);
          
          // TODO: Send alert to monitoring system
          // sendErrorRateAlert(errorRate);
        }
      }
    });
    
    next();
  };
};

/**
 * Health check logging
 * Logs system health information
 */
export const healthLogger = (): void => {
  const logHealth = (): void => {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    console.log(`💚 Health check: Uptime ${Math.floor(uptime)}s, ` +
               `Memory ${formatBytes(memUsage.heapUsed)}/${formatBytes(memUsage.heapTotal)}`);
  };

  // Log health every 10 minutes (no initial log)
  setInterval(logHealth, 10 * 60 * 1000);
};
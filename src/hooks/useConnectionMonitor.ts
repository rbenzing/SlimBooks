import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '@/utils/api';

interface ConnectionMonitorOptions {
  checkInterval?: number; // How often to check connection when connected (ms)
  retryInterval?: number; // How often to retry when disconnected (ms)
  maxRetries?: number; // Maximum number of retry attempts
  baseUrl?: string; // API base URL
}

interface ConnectionState {
  isConnected: boolean;
  isChecking: boolean;
  retryCount: number;
  lastError: string | null;
}

export const useConnectionMonitor = (options: ConnectionMonitorOptions = {}) => {
  const {
    checkInterval = 60000, // Check every minute when connected
    retryInterval = 20000, // Retry every 20 seconds when disconnected
    maxRetries = 30, // Max 30 retries (10 minutes at 20s intervals)
    baseUrl = API_BASE
  } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: true, // Start optimistic
    isChecking: false,
    retryCount: 0,
    lastError: null
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMonitoringRef = useRef(false);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      setConnectionState(prev => ({ ...prev, isChecking: true }));
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      // Connection successful
      setConnectionState(prev => ({
        ...prev,
        isConnected: true,
        isChecking: false,
        retryCount: 0,
        lastError: null
      }));

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      setConnectionState(prev => ({
        ...prev,
        isConnected: false,
        isChecking: false,
        lastError: errorMessage
      }));

      return false;
    }
  }, [baseUrl]);

  const setupInterval = useCallback((isRetryMode: boolean) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const interval = isRetryMode ? retryInterval : checkInterval;

    intervalRef.current = setInterval(async () => {
      if (isRetryMode) {
        // In retry mode, increment retry count first
        setConnectionState(prev => {
          if (prev.retryCount >= maxRetries) {
            // Stop retrying after max attempts
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            return prev;
          }
          return { ...prev, retryCount: prev.retryCount + 1 };
        });
      }

      const isConnected = await checkConnection();

      if (isRetryMode && isConnected) {
        // Connection restored, switch back to normal monitoring
        setupInterval(false);
      } else if (!isRetryMode && !isConnected) {
        // Connection lost, start retry logic
        setupInterval(true);
      }
    }, interval);
  }, [checkConnection, checkInterval, retryInterval, maxRetries]);

  const startMonitoring = useCallback(() => {
    setupInterval(false);
  }, [setupInterval]);

  const startRetrying = useCallback(() => {
    setupInterval(true);
  }, [setupInterval]);

  const startConnectionMonitoring = useCallback(() => {
    if (isMonitoringRef.current) return;
    
    isMonitoringRef.current = true;
    
    // Initial connection check
    checkConnection().then(isConnected => {
      if (isConnected) {
        startMonitoring();
      } else {
        startRetrying();
      }
    });
  }, [checkConnection, startMonitoring, startRetrying]);

  const stopConnectionMonitoring = useCallback(() => {
    isMonitoringRef.current = false;
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetRetryCount = useCallback(() => {
    setConnectionState(prev => ({ ...prev, retryCount: 0 }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopConnectionMonitoring();
    };
  }, [stopConnectionMonitoring]);

  return {
    ...connectionState,
    startConnectionMonitoring,
    stopConnectionMonitoring,
    resetRetryCount,
    hasExceededMaxRetries: connectionState.retryCount >= maxRetries
  };
};

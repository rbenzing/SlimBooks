// Activity-aware token expiry monitoring service with smart session management
import { log, warn } from '@/utils/logger.util';
import {
  getRefreshToken,
  getToken,
  getTokenPayload,
  getTokenPersistence,
  isAuthenticated,
  setRefreshToken,
  setToken
} from '@/utils/api/auth.util';

export class TokenManagerService {
  private static instance: TokenManagerService;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 60000; // Check every minute (less frequent)
  private readonly WARNING_THRESHOLD_MS = 5 * 60 * 1000; // Warn 5 minutes before expiry
  private readonly ACTIVITY_THRESHOLD_MS = 2 * 60 * 1000; // Consider user active if activity within 2 minutes
  private onTokenExpired?: () => void;
  private onTokenWarning?: (minutesLeft: number) => void;
  private onWarningDismissed?: () => void;
  
  // Activity tracking
  private lastActivityTime: number = Date.now();
  private activityListeners: (() => void)[] = [];
  private isTrackingActivity: boolean = false;
  private hasShownWarning: boolean = false;
  private warningTimeoutId: NodeJS.Timeout | null = null;

  static getInstance(): TokenManagerService {
    if (!TokenManagerService.instance) {
      TokenManagerService.instance = new TokenManagerService();
    }
    return TokenManagerService.instance;
  }

  /**
   * Start monitoring token expiration with activity awareness
   */
  startMonitoring(onExpired: () => void, onWarning?: (minutesLeft: number) => void, onWarningDismissed?: () => void) {
    this.onTokenExpired = onExpired;
    this.onTokenWarning = onWarning;
    this.onWarningDismissed = onWarningDismissed;
    
    // Clear any existing interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Start activity tracking
    this.startActivityTracking();

    // Start checking token expiry time
    this.checkInterval = setInterval(() => {
      this.checkTokenExpiry();
    }, this.CHECK_INTERVAL_MS);

    // Perform immediate check
    this.checkTokenExpiry();
  }

  /**
   * Stop monitoring token expiration
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    // Stop activity tracking
    this.stopActivityTracking();
    
    // Clear any pending warning timeout
    if (this.warningTimeoutId) {
      clearTimeout(this.warningTimeoutId);
      this.warningTimeoutId = null;
    }
    
    this.onTokenExpired = undefined;
    this.onTokenWarning = undefined;
    this.onWarningDismissed = undefined;
    this.hasShownWarning = false;
  }

  /**
   * Activity-aware token expiry check
   */
  private checkTokenExpiry() {
    const token = getToken();
    if (!token) {
      return; // No token to check
    }

    // Simple JWT payload decode without verification
    const payload = getTokenPayload(token);
    if (!payload || !payload.exp) {
      warn('Invalid token format - no expiry found');
      return;
    }

    // Check if token has expired
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = (payload.exp - now) * 1000; // Convert to milliseconds

    if (timeUntilExpiry <= 0) {
      // Token has expired - redirect to login
      log('Token expired, redirecting to login');
      this.handleTokenExpiration();
    } else if (timeUntilExpiry <= this.WARNING_THRESHOLD_MS) {
      // Token will expire soon - check if user is active
      const timeSinceActivity = Date.now() - this.lastActivityTime;
      
      if (timeSinceActivity <= this.ACTIVITY_THRESHOLD_MS) {
        // User is active, silently refresh token
        log('User is active during warning period, refreshing token silently');
        this.handleActivityBasedRefresh();
      } else if (this.onTokenWarning && !this.hasShownWarning) {
        // User is not active, show warning
        const minutesLeft = Math.ceil(timeUntilExpiry / (60 * 1000));
        this.handleTokenWarning(minutesLeft);
      }
    } else {
      // Token is not in warning period, reset warning state
      if (this.hasShownWarning) {
        this.hasShownWarning = false;
        if (this.warningTimeoutId) {
          clearTimeout(this.warningTimeoutId);
          this.warningTimeoutId = null;
        }
      }
    }
  }

  /**
   * Handle token expiration - simple redirect
   */
  private handleTokenExpiration() {
    if (this.onTokenExpired) {
      this.onTokenExpired();
    }
  }

  /**
   * Handle token warning (close to expiration)
   */
  private handleTokenWarning(minutesLeft: number) {
    log(`Token will expire in ${minutesLeft} minutes`);
    this.hasShownWarning = true;
    
    if (this.onTokenWarning) {
      this.onTokenWarning(minutesLeft);
    }
    
    // Set up a timeout to check for activity during warning period
    if (this.warningTimeoutId) {
      clearTimeout(this.warningTimeoutId);
    }
    
    this.warningTimeoutId = setTimeout(() => {
      // Check if user became active during warning period
      const timeSinceActivity = Date.now() - this.lastActivityTime;
      if (timeSinceActivity <= this.ACTIVITY_THRESHOLD_MS) {
        log('User became active during warning period, refreshing token');
        this.handleActivityBasedRefresh();
      }
    }, 10000); // Check every 10 seconds during warning period
  }

  /**
   * Get time until token expiration in milliseconds - simple version
   */
  getTimeUntilExpiry(): number | null {
    const token = getToken();
    if (!token) return null;

    const payload = getTokenPayload(token);
    if (!payload || !payload.exp) return null;

    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, (payload.exp - now) * 1000);
  }

  /**
   * Check if the stored token is missing or expired
   */
  isTokenExpired(): boolean {
    return !isAuthenticated();
  }

  /**
   * Refresh the current token using the refresh token
   */
  async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        warn('No refresh token available');
        return false;
      }

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshToken}`
        }
      });

      if (!response.ok) {
        warn('Token refresh failed:', response.status);
        return false;
      }

      const result = await response.json();
      if (result.success && result.data?.token) {
        // Rotate the tokens in place, honouring the original remember-me choice
        const persistence = getTokenPersistence();
        setToken(result.data.token, persistence);
        if (result.data.refreshToken) {
          setRefreshToken(result.data.refreshToken, persistence);
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }

  /**
   * Start tracking user activity
   */
  private startActivityTracking() {
    if (this.isTrackingActivity) {
      return; // Already tracking
    }

    this.isTrackingActivity = true;
    this.lastActivityTime = Date.now();

    // Track various user activities
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      const listener = () => this.registerActivity();
      document.addEventListener(event, listener, { passive: true });
      this.activityListeners.push(() => document.removeEventListener(event, listener));
    });

    // Track focus events
    const focusListener = () => this.registerActivity();
    window.addEventListener('focus', focusListener);
    this.activityListeners.push(() => window.removeEventListener('focus', focusListener));
  }

  /**
   * Stop tracking user activity
   */
  private stopActivityTracking() {
    if (!this.isTrackingActivity) {
      return;
    }

    this.isTrackingActivity = false;
    
    // Remove all event listeners
    this.activityListeners.forEach(removeListener => removeListener());
    this.activityListeners = [];
  }

  /**
   * Register user activity
   */
  registerActivity() {
    this.lastActivityTime = Date.now();
    
    // If we're in warning period and user becomes active, handle refresh
    if (this.hasShownWarning) {
      log('Activity detected during warning period');
      // Small delay to avoid rapid refreshes
      setTimeout(() => {
        if (this.hasShownWarning && Date.now() - this.lastActivityTime < 1000) {
          this.handleActivityBasedRefresh();
        }
      }, 500);
    }
  }

  /**
   * Handle activity-based token refresh
   */
  private async handleActivityBasedRefresh() {
    try {
      const success = await this.refreshToken();
      if (success) {
        log('Token refreshed due to user activity');
        this.hasShownWarning = false;
        
        if (this.warningTimeoutId) {
          clearTimeout(this.warningTimeoutId);
          this.warningTimeoutId = null;
        }
        
        // Notify that warning should be dismissed
        if (this.onWarningDismissed) {
          this.onWarningDismissed();
        }
      }
    } catch (error) {
      console.error('Failed to refresh token on activity:', error);
    }
  }

  /**
   * Get last activity time
   */
  getLastActivityTime(): number {
    return this.lastActivityTime;
  }

  /**
   * Check if user has been active recently
   */
  isUserActive(): boolean {
    const timeSinceActivity = Date.now() - this.lastActivityTime;
    return timeSinceActivity <= this.ACTIVITY_THRESHOLD_MS;
  }

  /**
   * Get token information for debugging - enhanced version
   */
  getTokenInfo(): {
    hasToken: boolean;
    expiresAt?: Date;
    timeUntilExpiry?: number;
    isExpired?: boolean;
    lastActivityTime?: Date;
    isUserActive?: boolean;
    timeSinceActivity?: number;
  } {
    const token = getToken();
    if (!token) {
      return { hasToken: false };
    }

    const payload = getTokenPayload(token);
    if (!payload || !payload.exp) {
      return { hasToken: true, isExpired: true };
    }

    const expiresAt = new Date(payload.exp * 1000);
    const timeUntilExpiry = this.getTimeUntilExpiry();
    const isExpired = this.isTokenExpired();
    const timeSinceActivity = Date.now() - this.lastActivityTime;

    return {
      hasToken: true,
      expiresAt,
      timeUntilExpiry: timeUntilExpiry || 0,
      isExpired,
      lastActivityTime: new Date(this.lastActivityTime),
      isUserActive: this.isUserActive(),
      timeSinceActivity
    };
  }
}
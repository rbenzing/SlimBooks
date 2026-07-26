
// Authentication context for React application

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { type User, type AuthResponse } from '@/types';
import { AuthService } from '@/services/auth.svc';
import { TokenManagerService } from '@/services/tokenManager.svc';
import {
  clearAuthTokens,
  getToken,
  isTokenExpired,
  setAuthTokens,
  TokenPersistence
} from '@/utils/api/auth.util';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<AuthResponse>;
  register: (name: string, email: string, password: string, confirmPassword: string) => Promise<AuthResponse>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const authService = useMemo(() => AuthService.getInstance(), []);
  const tokenManager = useMemo(() => TokenManagerService.getInstance(), []);

  // The outstanding expiry-warning toast, held in a ref rather than state: as
  // state it was a dependency of the monitoring effect below *and* written from
  // inside that effect's own warning callback, so raising a warning re-ran the
  // effect, whose cleanup stopped monitoring and dismissed the toast it had
  // just raised.
  const warningToastRef = useRef<string | number | null>(null);

  const dismissWarningToast = useCallback(() => {
    if (warningToastRef.current !== null) {
      toast.dismiss(warningToastRef.current);
      warningToastRef.current = null;
    }
  }, []);

  /** Tears the session down locally. Shared by manual and automatic logout. */
  const clearSession = useCallback(() => {
    setUser(null);
    authService.logout();
    tokenManager.stopMonitoring();
    dismissWarningToast();
    // Clear tokens from both storages
    clearAuthTokens();
  }, [authService, tokenManager, dismissWarningToast]);

  const handleAutoLogout = useCallback(() => {
    clearSession();
    // Force redirect to login page
    window.location.href = '/login';
  }, [clearSession]);

  const initializeAuth = useCallback(async () => {
    try {
      setLoading(true);

      // Check for existing session with simple expiry check
      const token = getToken();
      if (token) {
        // Simple expiry check before attempting backend verification
        if (isTokenExpired(token)) {
          clearAuthTokens();
        } else {
          // Token not expired, try to verify with backend
          try {
            const verifiedUser = await authService.verifyToken(token);
            if (verifiedUser) {
              setUser(verifiedUser);
              authService.setCurrentUser(verifiedUser);
            } else {
              // Backend verification failed, clear tokens
              clearAuthTokens();
            }
          } catch (error) {
            console.warn('Token verification failed:', error);
            // Clear tokens on verification error
            clearAuthTokens();
          }
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
    } finally {
      setLoading(false);
    }
  }, [authService]);

  // Initialize authentication state
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Activity-aware token expiry monitoring. Depends only on `user`, so the
  // monitor is armed once per session rather than restarted on every warning.
  useEffect(() => {
    if (!user) {
      tokenManager.stopMonitoring();
      dismissWarningToast();
      return;
    }

    tokenManager.startMonitoring(
      () => {
        // Handle token expiration - redirect to login
        toast.error('Your session has expired. Please log in again.');
        handleAutoLogout();
      },
      (minutesLeft) => {
        // Handle token warning - track it so activity can dismiss it
        warningToastRef.current = toast.warning(
          `Your session will expire in ${minutesLeft} minutes.`,
          { duration: 10000 }
        );
      },
      () => {
        // Handle warning dismissal when user becomes active
        if (warningToastRef.current !== null) {
          dismissWarningToast();
          toast.success('Session extended due to activity', { duration: 3000 });
        }
      }
    );

    return () => {
      tokenManager.stopMonitoring();
      dismissWarningToast();
    };
  }, [user, tokenManager, handleAutoLogout, dismissWarningToast]);

  const login = async (email: string, password: string, rememberMe: boolean = false): Promise<AuthResponse> => {
    try {
      const response = await authService.login({ email, password, rememberMe });

      if (response.success && response.user && response.session_token) {
        // Store tokens BEFORE setting user state to ensure they're available for API calls
        setAuthTokens(
          response.session_token,
          response.refresh_token,
          rememberMe ? TokenPersistence.Persistent : TokenPersistence.Session
        );

        // Set user state AFTER tokens are stored
        setUser(response.user);
        authService.setCurrentUser(response.user);
      }

      return response;
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Login failed. Please try again.' };
    }
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    confirmPassword: string
  ): Promise<AuthResponse> => {
    try {
      const response = await authService.register({
        name,
        email,
        password,
        confirm_password: confirmPassword
      });

      return response;
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, message: 'Registration failed. Please try again.' };
    }
  };



  const logout = () => {
    clearSession();
  };

  const refreshUser = async () => {
    try {
      const token = getToken();
      if (token && user) {
        const updatedUser = await authService.verifyToken(token);
        if (updatedUser) {
          setUser(updatedUser);
        }
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    refreshUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Protected Route component
interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  fallback?: ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
  fallback
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login page with current location as state
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && user.role !== 'admin') {
    return fallback || (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// Hook for checking permissions
export const usePermissions = () => {
  const { user } = useAuth();

  return {
    canViewAdminPanel: user?.role === 'admin',
    canManageUsers: user?.role === 'admin',
    canManageSettings: user?.role === 'admin',
    canViewReports: !!user,
    canCreateInvoices: !!user,
    canManageClients: !!user,
    canManageExpenses: !!user
  };
};

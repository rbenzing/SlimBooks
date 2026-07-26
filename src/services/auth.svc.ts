// Authentication service for login, registration, and session management
// TODO: Register method needs refactoring to use backend API endpoint /api/auth/register
// TODO: completeLogin method needs to be removed or moved to backend

// REMOVED: import { userOperations } from '@/lib/database';
// Database operations should be done via backend API, not direct DB access
import { AuthUtils } from '@/utils/api';
import { envConfig } from '@/lib/env-config';
import { 
  type User, 
  type LoginCredentials, 
  type RegisterData, 
  type AuthResponse, 
  DEFAULT_SECURITY_SETTINGS 
} from '@/types';

export class AuthService {
  private static instance: AuthService;
  private currentUser: User | null = null;
  private sessionToken: string | null = null;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();

    }
    return AuthService.instance;
  }


  // User registration - Now uses backend API
  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      // Validate input
      if (!AuthUtils.isValidEmail(data.email)) {
        return { success: false, message: 'Invalid email address' };
      }

      if (data.password !== data.confirm_password) {
        return { success: false, message: 'Passwords do not match' };
      }

      // Check password strength
      const passwordValidation = AuthUtils.validatePassword(data.password, DEFAULT_SECURITY_SETTINGS.password_requirements);
      if (!passwordValidation.isValid) {
        return { success: false, message: passwordValidation.errors.join(', ') };
      }

      // Call backend registration API
      const response = await fetch(`${envConfig.API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
          confirm_password: data.confirm_password
        })
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: result.message || 'Registration failed. Please try again.'
        };
      }

      // Transform backend response to match expected format
      return {
        success: result.success,
        user: result.data?.user,
        message: result.message || 'Registration successful. Please check your email for verification instructions.',
        requires_email_verification: result.requires_email_verification || DEFAULT_SECURITY_SETTINGS.require_email_verification
      };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, message: 'Registration failed. Please try again.' };
    }
  }

  // User login
  async login(credentials: LoginCredentials & { rememberMe?: boolean }): Promise<AuthResponse> {
    try {
      const response = await fetch(`${envConfig.API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          rememberMe: credentials.rememberMe || false
        })
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: result.message || 'Login failed. Please try again.'
        };
      }

      // Store user and token if login successful
      if (result.success && result.data?.user && result.data?.token) {
        this.currentUser = result.data.user;
        this.sessionToken = result.data.token;

        await this.completeLogin(result.data.user);
        
        // Transform the response to match what AuthContext expects
        return {
          success: result.success,
          user: result.data.user,
          session_token: result.data.token, // Map token to session_token
          message: result.message,
          requires_email_verification: result.requires_email_verification
        };
      }

      return result;
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Login failed. Please try again.' };
    }
  }

  // Complete login process - Backend now handles this
  private async completeLogin(user: User): Promise<void> {
    // Backend API already handles updating login attempts and last login time
    // No need for frontend to do this directly
    this.currentUser = user;
  }

  // Token generation is handled entirely by the backend via JWT
  // This ensures proper security and prevents client-side token forgery

  // Get current user
  getCurrentUser(): User | null {
    return this.currentUser;
  }

  // Set current user (for session restoration)
  setCurrentUser(user: User): void {
    this.currentUser = user;
  }

  // Logout
  logout(): void {
    this.currentUser = null;
    this.sessionToken = null;
    // In a real app, you'd also invalidate the session in the database
  }

  // Verify session token with server
  async verifyToken(token: string): Promise<User | null> {
    try {
      // Make a simple authenticated API call to verify the token
      const response = await fetch(`${envConfig.API_URL}/api/auth/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      if (!result.success || !result.data) {
        return null;
      }

      const user = result.data;
      this.currentUser = user;
      this.sessionToken = token;
      return user;
    } catch (error) {
      console.error('Token verification error:', error);
      return null;
    }
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  // Check if user has specific role
  hasRole(role: string): boolean {
    return this.currentUser?.role === role;
  }

  // Check if user is admin
  isAdmin(): boolean {
    return this.hasRole('admin');
  }
}

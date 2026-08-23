
import { useEffect, lazy, Suspense } from 'react';
import { useTheme } from './hooks/useTheme.hook';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth, ProtectedRoute } from './contexts/AuthContext';
import { ResponsiveLayout } from './components/ResponsiveLayout';
import { Toaster } from './components/ui/sonner';
import { useConnectionMonitor } from './hooks/useConnectionMonitor';
import { ConnectionLostDialog } from './components/ConnectionLostDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import './App.css';

// Lazy load route components
const DashboardOverview = lazy(() => import('./components/DashboardOverview').then(m => ({ default: m.DashboardOverview })));
const ClientManagement = lazy(() => import('./components/ClientManagement').then(m => ({ default: m.ClientManagement })));
const UserManagement = lazy(() => import('./components/UserManagement').then(m => ({ default: m.UserManagement })));
const EditClientPage = lazy(() => import('./components/clients/EditClientPage').then(m => ({ default: m.EditClientPage })));
const InvoiceManagement = lazy(() => import('./components/InvoiceManagement').then(m => ({ default: m.InvoiceManagement })));
const CreateInvoicePage = lazy(() => import('./components/invoices/CreateInvoicePage').then(m => ({ default: m.CreateInvoicePage })));
const EditInvoicePage = lazy(() => import('./components/invoices/EditInvoicePage').then(m => ({ default: m.EditInvoicePage })));
const CreateRecurringInvoicePage = lazy(() => import('./components/invoices/CreateRecurringInvoicePage').then(m => ({ default: m.CreateRecurringInvoicePage })));
const ExpenseManagement = lazy(() => import('./components/ExpenseManagement').then(m => ({ default: m.ExpenseManagement })));
const PaymentManagement = lazy(() => import('./components/PaymentManagement').then(m => ({ default: m.PaymentManagement })));
const ReportsManagement = lazy(() => import('./components/ReportsManagement').then(m => ({ default: m.ReportsManagement })));
const ResponsiveSettings = lazy(() => import('./components/ResponsiveSettings').then(m => ({ default: m.ResponsiveSettings })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage').then(m => ({ default: m.VerifyEmailPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const NotFound = lazy(() => import('./pages/NotFound'));
const PublicInvoiceView = lazy(() => import('./components/PublicInvoiceView'));

const queryClient = new QueryClient();

// Loading fallback component
const RouteLoadingFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="text-muted-foreground">Loading...</div>
  </div>
);

const App = () => {
  const { isAuthenticated, loading } = useAuth();
  
  // Initialize theme system
  useTheme();

  // Connection monitoring - only start when authenticated
  const {
    isConnected,
    isChecking,
    retryCount,
    hasExceededMaxRetries,
    lastError,
    startConnectionMonitoring,
    stopConnectionMonitoring
  } = useConnectionMonitor({
    checkInterval: 60000, // Check every minute when connected
    retryInterval: 20000, // Retry every 20 seconds when disconnected
    maxRetries: 30, // Max 30 retries (10 minutes)
  });


  // Start/stop connection monitoring based on authentication
  useEffect(() => {
    if (isAuthenticated) {
      startConnectionMonitoring();
    } else {
      stopConnectionMonitoring();
    }
  }, [isAuthenticated, startConnectionMonitoring, stopConnectionMonitoring]);

  // Removed global recurring invoice processing - now handled only on invoice-related pages

  // Show loading screen while auth is initializing
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Router>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/invoice/:id" element={<PublicInvoiceView />} />

            {/* Root redirect */}
            <Route path="/" element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            } />

            {/* Protected routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <DashboardOverview />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/clients" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <ClientManagement />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/users" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <UserManagement />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/clients/new" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <EditClientPage />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/clients/edit/:id" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <EditClientPage />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/invoices" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <InvoiceManagement />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/invoices/create" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <CreateInvoicePage onBack={() => window.history.back()} />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/invoices/edit/:id" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <EditInvoicePage />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/recurring-invoices/create" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <CreateRecurringInvoicePage onBack={() => window.history.back()} />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/recurring-invoices/edit/:id" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <CreateRecurringInvoicePage onBack={() => window.history.back()} />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/expenses" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <ExpenseManagement />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/payments" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <PaymentManagement />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/reports" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <ReportsManagement />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="/settings" element={
              <ProtectedRoute>
                <ResponsiveLayout>
                  <ResponsiveSettings />
                </ResponsiveLayout>
              </ProtectedRoute>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          <Toaster />

          {/* Connection Lost Dialog - only show when authenticated and disconnected */}
          <ConnectionLostDialog
            isVisible={isAuthenticated && !isConnected}
            retryCount={retryCount}
            maxRetries={30}
            isChecking={isChecking}
            hasExceededMaxRetries={hasExceededMaxRetries}
            lastError={lastError}
          />
        </Router>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;

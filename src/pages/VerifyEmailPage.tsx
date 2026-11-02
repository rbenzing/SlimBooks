import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, Mail, ArrowLeft } from 'lucide-react';

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'expired'>('verifying');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');
      
      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link. Please check your email for the correct link.');
        return;
      }

      try {
        // Call the API to verify the email - backend validates the token
        const response = await fetch(`/api/auth/verify-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        const result = await response.json();

        if (result.success) {
          setStatus('success');
          setMessage('Your email has been successfully verified! You can now log in to your account.');
          setEmail(result.data?.email || '');

          // Redirect to login page after 3 seconds
          setTimeout(() => {
            navigate('/login', {
              state: {
                message: 'Email verified successfully! You can now log in.',
                email: result.data?.email
              }
            });
          }, 3000);
        } else {
          setStatus('error');
          setMessage(result.message || 'Email verification failed. Please try again.');
        }
      } catch (error) {
        console.error('Email verification error:', error);
        setStatus('error');
        setMessage('An error occurred while verifying your email. Please try again.');
      }
    };

    verifyEmail();
  }, [searchParams, navigate]);

  const handleResendVerification = async () => {
    if (!email) {
      setMessage('Please enter your email address to resend verification.');
      return;
    }

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();
      
      if (result.success) {
        setMessage('Verification email sent! Please check your inbox.');
      } else {
        setMessage(result.message || 'Failed to send verification email.');
      }
    } catch (error) {
      console.error('Resend verification error:', error);
      setMessage('An error occurred while sending verification email.');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />;
      case 'error':
      case 'expired':
        return <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />;
      case 'verifying':
      default:
        return <Mail className="h-16 w-16 text-blue-500 mx-auto mb-4 animate-pulse" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'text-green-600';
      case 'error':
      case 'expired':
        return 'text-red-600';
      case 'verifying':
      default:
        return 'text-blue-600';
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link to="/" className="inline-flex items-center text-primary hover:text-primary/80 mb-8">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Link>
          
          <div className="bg-card rounded-lg shadow-xs border border-border p-8">
            {getStatusIcon()}
            
            <h2 className={`text-2xl font-bold ${getStatusColor()} mb-4`}>
              {status === 'verifying' && 'Verifying Email...'}
              {status === 'success' && 'Email Verified!'}
              {status === 'error' && 'Verification Failed'}
              {status === 'expired' && 'Link Expired'}
            </h2>
            
            <p className="text-muted-foreground mb-6">
              {message}
            </p>

            {status === 'success' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Redirecting to login page in 3 seconds...
                </p>
                <Link
                  to="/login"
                  state={{ email }}
                  className="w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-xs text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                  Go to Login
                </Link>
              </div>
            )}

            {(status === 'error' || status === 'expired') && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-card-foreground mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary bg-background text-card-foreground"
                    placeholder="Enter your email address"
                  />
                </div>
                
                <button
                  onClick={handleResendVerification}
                  className="w-full py-2 px-4 border border-transparent rounded-md shadow-xs text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                  Resend Verification Email
                </button>
                
                <Link
                  to="/login"
                  className="w-full inline-flex justify-center py-2 px-4 border border-border rounded-md shadow-xs text-sm font-medium text-card-foreground bg-background hover:bg-accent focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                  Back to Login
                </Link>
              </div>
            )}

            {status === 'verifying' && (
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

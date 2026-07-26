import { toast } from 'sonner';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ErrorOptions {
  severity?: ErrorSeverity;
  logToConsole?: boolean;
  userMessage?: string;
  technicalDetails?: unknown;
}

export const handleError = (
  error: unknown,
  options: ErrorOptions = {}
) => {
  const {
    severity = 'error',
    logToConsole = true,
    userMessage,
    technicalDetails
  } = options;

  const errorMessage = error instanceof Error
    ? error.message
    : 'An unknown error occurred';
  const displayMessage = userMessage || errorMessage;

  // Log to console in development
  if (logToConsole && import.meta.env.DEV) {
    console.error('[Error]', errorMessage, technicalDetails, error);
  }

  // Show toast notification
  switch (severity) {
    case 'critical':
    case 'error':
      toast.error(displayMessage);
      break;
    case 'warning':
      toast.warning(displayMessage);
      break;
    case 'info':
      toast.info(displayMessage);
      break;
  }

  return errorMessage;
};

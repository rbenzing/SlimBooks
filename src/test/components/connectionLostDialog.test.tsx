import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionLostDialog } from '@/components/ConnectionLostDialog';

/**
 * The one modal a user must not be able to dismiss. Escape closing it would
 * leave the app looking usable while every request fails.
 */
const props = {
  isVisible: true,
  retryCount: 1,
  maxRetries: 5,
  isChecking: false,
  hasExceededMaxRetries: false,
  lastError: null
};

describe('ConnectionLostDialog', () => {
  it('offers no close affordance', () => {
    render(<ConnectionLostDialog {...props} />);
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('refuses Escape', () => {
    const { container } = render(<ConnectionLostDialog {...props} />);
    const cancel = new Event('cancel', { cancelable: true });
    container.querySelector('dialog')!.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
  });

  // The heading changes once retries are exhausted, so it is driven by the
  // same value the body reads rather than hardcoded in the Modal call.
  it('names itself for the exhausted-retries case', () => {
    render(<ConnectionLostDialog {...props} hasExceededMaxRetries />);
    expect(screen.getByRole('dialog', { name: 'Connection Failed' })).toBeInTheDocument();
  });

  it('names itself for the reconnecting case', () => {
    render(<ConnectionLostDialog {...props} />);
    expect(screen.getByRole('dialog', { name: 'Connection Lost' })).toBeInTheDocument();
  });
});

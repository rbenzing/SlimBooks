import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProjectSettings } from './useProjectSettings';

const { getProjectSettings } = vi.hoisted(() => ({
  getProjectSettings: vi.fn()
}));
vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: { getProjectSettings }
}));

beforeEach(() => vi.clearAllMocks());

describe('useProjectSettings', () => {
  it('carries the password policy through from a public settings response', async () => {
    getProjectSettings.mockResolvedValue({
      google_oauth: { enabled: false, client_id: '', configured: false },
      stripe: { enabled: false, publishable_key: '', configured: false },
      email: { enabled: false, configured: false },
      security: {
        require_email_verification: true,
        password_policy: {
          min_length: 12,
          require_uppercase: true,
          require_lowercase: true,
          require_numbers: true,
          require_special: false
        }
      }
    });

    const { result } = renderHook(() => useProjectSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings?.security.password_policy).toEqual({
      min_length: 12,
      require_uppercase: true,
      require_lowercase: true,
      require_numbers: true,
      require_special: false
    });
  });

  it('falls back to no policy when the request fails, rather than a fixed one', async () => {
    getProjectSettings.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useProjectSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings?.security.password_policy).toBeUndefined();
  });
});

/**
 * Email configuration status tests.
 *
 * This util used to work the answer out in the browser, twice over and wrongly:
 * it read the stored settings looking for `smtpHost`/`smtpUsername`/`fromEmail`
 * while the settings tab writes `smtp_host`/`smtp_user`/`from_email`, then fell
 * back to `process.env`, which does not exist in a browser bundle. Both paths
 * always answered "not configured", which is why Require Email Verification
 * could never be switched on.
 *
 * It now asks the server, which is the only side that can see the password. The
 * tests below are about that delegation and about failing safe.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getStatus } = vi.hoisted(() => ({ getStatus: vi.fn() }));
vi.mock('@/services/email.svc', () => ({ emailService: { getStatus } }));

import { getEmailConfigurationStatus } from '@/utils/emailConfig.util';

const serverStatus = (over: Record<string, unknown> = {}) => ({
  isEnabled: true,
  configured: true,
  missingFields: [],
  canSendEmails: true,
  host: 'smtp.example.com',
  port: 587,
  security: 'tls',
  user: 'billing@example.com',
  fromEmail: 'billing@example.com',
  fromName: 'Slimbooks',
  ...over
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getStatus.mockResolvedValue(serverStatus());
});

afterEach(() => vi.restoreAllMocks());

describe('getEmailConfigurationStatus', () => {
  it('reports a working configuration', async () => {
    await expect(getEmailConfigurationStatus()).resolves.toEqual({
      isConfigured: true,
      isEnabled: true,
      missingFields: [],
      canSendEmails: true
    });
  });

  it('asks the server rather than deciding in the browser', async () => {
    await getEmailConfigurationStatus();

    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it('distinguishes switched-off from misconfigured', async () => {
    // Fully set up but turned off is a different problem from missing a
    // password, and the settings screen says different things about each.
    getStatus.mockResolvedValue(serverStatus({ isEnabled: false, canSendEmails: false }));

    await expect(getEmailConfigurationStatus()).resolves.toEqual({
      isConfigured: true,
      isEnabled: false,
      missingFields: [],
      canSendEmails: false
    });
  });

  it('passes through which fields are missing', async () => {
    getStatus.mockResolvedValue(serverStatus({
      configured: false,
      canSendEmails: false,
      missingFields: ['Password', 'From Email']
    }));

    const status = await getEmailConfigurationStatus();

    expect(status.missingFields).toEqual(['Password', 'From Email']);
    expect(status.canSendEmails).toBe(false);
  });

  it('does not claim email works when the check itself failed', async () => {
    // Failing open here would let the app try to send verification emails it
    // cannot send, locking new users out of their accounts.
    getStatus.mockRejectedValue(new Error('backend unavailable'));

    await expect(getEmailConfigurationStatus()).resolves.toEqual({
      isConfigured: false,
      isEnabled: false,
      missingFields: ['Configuration check failed'],
      canSendEmails: false
    });
  });

  it('reports the failure without throwing at its caller', async () => {
    getStatus.mockRejectedValue(new Error('offline'));

    await expect(getEmailConfigurationStatus()).resolves.toBeTruthy();
  });
});

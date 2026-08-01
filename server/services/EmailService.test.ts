/**
 * EmailService tests.
 *
 * nodemailer is mocked throughout: these tests assert what transport we ask for
 * and what we do with the answer. No network, no credentials.
 *
 * The thing worth pinning is the security mapping. `secure: true` means TLS
 * from the first byte (port 465); STARTTLS on 587 is `secure: false` plus an
 * upgrade, which reads like "unencrypted" and is not. Getting that pair wrong
 * fails at connect time in a way that looks exactly like a wrong password.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const getSettingByKey = vi.fn();
vi.mock('./SettingsService.js', () => ({ settingsService: { getSettingByKey } }));

const transport = {
  verify: vi.fn(),
  sendMail: vi.fn()
};
const createTransport = vi.fn(() => transport);
vi.mock('nodemailer', () => ({
  default: { createTransport: (...args: unknown[]) => createTransport(...args) }
}));

const { emailService, EmailNotConfiguredError } = await import('./EmailService.js');

const stored = (over: Record<string, unknown> = {}) => ({
  smtp_host: 'smtp.example.com',
  smtp_port: 587,
  smtp_user: 'billing@example.com',
  smtp_password: 'secret',
  smtp_security: 'tls',
  from_email: 'billing@example.com',
  from_name: 'Slimbooks',
  isEnabled: true,
  ...over
});

const env = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  createTransport.mockReturnValue(transport);
  transport.verify.mockResolvedValue(true);
  transport.sendMail.mockResolvedValue({ messageId: 'msg-1' });
  getSettingByKey.mockResolvedValue(stored());
  for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'SMTP_PORT']) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
});

describe('credential resolution', () => {
  it('reads the settings the Email tab writes', async () => {
    await expect(emailService.getCredentials()).resolves.toMatchObject({
      host: 'smtp.example.com',
      user: 'billing@example.com',
      password: 'secret',
      fromEmail: 'billing@example.com',
      configured: true
    });
  });

  it('reads the row the tab writes, not a differently-named one', async () => {
    await emailService.getCredentials();

    expect(getSettingByKey).toHaveBeenCalledWith('email.email_settings');
  });

  it('falls back to .env when nothing is stored', async () => {
    getSettingByKey.mockResolvedValue(null);
    process.env.SMTP_HOST = 'smtp.env.test';
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASS = 'env-secret';
    process.env.EMAIL_FROM = 'billing@env.test';

    await expect(emailService.getCredentials()).resolves.toMatchObject({
      host: 'smtp.env.test',
      configured: true
    });
  });

  it('counts an install configured entirely through .env as switched on', async () => {
    // It has already made the decision; making it also find a toggle would be
    // a second answer to the same question.
    getSettingByKey.mockResolvedValue(null);
    process.env.SMTP_HOST = 'smtp.env.test';
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASS = 'env-secret';

    await expect(emailService.getCredentials()).resolves.toMatchObject({ isEnabled: true });
  });

  it('honours an explicit off switch over the .env default', async () => {
    getSettingByKey.mockResolvedValue(stored({ isEnabled: false }));
    process.env.SMTP_HOST = 'smtp.env.test';
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASS = 'env-secret';

    await expect(emailService.getCredentials()).resolves.toMatchObject({ isEnabled: false });
  });

  it('prefers a saved host over the one in .env', async () => {
    process.env.SMTP_HOST = 'smtp.env.test';

    await expect(emailService.getCredentials()).resolves.toMatchObject({
      host: 'smtp.example.com'
    });
  });

  it('reads the older boolean security flag as STARTTLS', async () => {
    // The boolean could not tell SSL from STARTTLS. True meant "secure", which
    // on the default port 587 is STARTTLS.
    getSettingByKey.mockResolvedValue(stored({ smtp_security: undefined, smtp_secure: true }));

    await expect(emailService.getCredentials()).resolves.toMatchObject({ security: 'tls' });
  });

  it('reads a false boolean security flag as no encryption', async () => {
    getSettingByKey.mockResolvedValue(stored({ smtp_security: undefined, smtp_secure: false }));

    await expect(emailService.getCredentials()).resolves.toMatchObject({ security: 'none' });
  });

  it('defaults the port to 587', async () => {
    getSettingByKey.mockResolvedValue(stored({ smtp_port: undefined }));

    await expect(emailService.getCredentials()).resolves.toMatchObject({ port: 587 });
  });
});

describe('getStatus', () => {
  it('never discloses the password', async () => {
    const status = await emailService.getStatus();

    expect(JSON.stringify(status)).not.toMatch(/secret/);
  });

  it('names every missing field', async () => {
    getSettingByKey.mockResolvedValue(stored({ smtp_password: '', from_email: '' }));

    const status = await emailService.getStatus();

    expect(status.missingFields).toEqual(['Password', 'From Email']);
    expect(status.canSendEmails).toBe(false);
  });

  it('separates switched-off from misconfigured', async () => {
    getSettingByKey.mockResolvedValue(stored({ isEnabled: false }));

    await expect(emailService.getStatus()).resolves.toMatchObject({
      configured: true,
      isEnabled: false,
      canSendEmails: false,
      missingFields: []
    });
  });

  it('reports the host and sender so the tab can show them', async () => {
    await expect(emailService.getStatus()).resolves.toMatchObject({
      host: 'smtp.example.com',
      port: 587,
      fromEmail: 'billing@example.com'
    });
  });
});

describe('transport construction', () => {
  it('uses secure: false for STARTTLS, which upgrades after connecting', async () => {
    getSettingByKey.mockResolvedValue(stored({ smtp_security: 'tls', smtp_port: 587 }));

    await emailService.testConnection();

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'billing@example.com', pass: 'secret' }
    }));
  });

  it('uses secure: true for SSL, which is encrypted from the first byte', async () => {
    getSettingByKey.mockResolvedValue(stored({ smtp_security: 'ssl', smtp_port: 465 }));

    await emailService.testConnection();

    expect(createTransport.mock.calls[0][0]).toMatchObject({ port: 465, secure: true });
  });

  it('disables TLS entirely only when asked to', async () => {
    getSettingByKey.mockResolvedValue(stored({ smtp_security: 'none', smtp_port: 25 }));

    await emailService.testConnection();

    expect(createTransport.mock.calls[0][0]).toMatchObject({ secure: false, ignoreTLS: true });
  });

  it('rebuilds the transport when the settings change, without a restart', async () => {
    await emailService.testConnection();
    getSettingByKey.mockResolvedValue(stored({ smtp_host: 'smtp.changed.test' }));

    await emailService.testConnection();

    expect(createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ host: 'smtp.changed.test' })
    );
  });

  it('reuses the transport while the settings are unchanged', async () => {
    getSettingByKey.mockResolvedValue(stored({ smtp_host: 'smtp.stable.test' }));
    await emailService.testConnection();
    createTransport.mockClear();

    await emailService.testConnection();

    expect(createTransport).not.toHaveBeenCalled();
  });
});

describe('testConnection', () => {
  it('opens a real connection rather than inspecting the settings', async () => {
    // The point of the button: a wrong password fails here, not silently at
    // the moment an invoice is sent.
    await expect(emailService.testConnection()).resolves.toEqual({
      success: true,
      message: 'SMTP connection successful'
    });
    expect(transport.verify).toHaveBeenCalled();
  });

  it('passes the transport error through, since it says what went wrong', async () => {
    transport.verify.mockRejectedValue(new Error('Invalid login: 535 authentication failed'));

    await expect(emailService.testConnection()).resolves.toEqual({
      success: false,
      message: 'Invalid login: 535 authentication failed'
    });
  });

  it('explains that sending is switched off instead of connecting', async () => {
    getSettingByKey.mockResolvedValue(stored({ isEnabled: false }));

    await expect(emailService.testConnection()).resolves.toMatchObject({
      success: false,
      message: /switched off/ as unknown as string
    });
    expect(transport.verify).not.toHaveBeenCalled();
  });

  it('names what is missing rather than reporting a generic failure', async () => {
    getSettingByKey.mockResolvedValue(stored({ smtp_password: '' }));

    const result = await emailService.testConnection();

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Password/);
  });
});

describe('sendEmail', () => {
  it('sends from the configured address, not one the caller chose', async () => {
    await emailService.sendEmail({ to: 'client@example.com', subject: 'Hi', html: '<p>Hi</p>' });

    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: '"Slimbooks" <billing@example.com>',
      to: 'client@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>'
    }));
  });

  it('includes a plain-text alternative when one is given', async () => {
    await emailService.sendEmail({
      to: 'a@b.co', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi'
    });

    expect(transport.sendMail.mock.calls[0][0]).toMatchObject({ text: 'Hi' });
  });

  it('omits the text part rather than sending an empty one', async () => {
    await emailService.sendEmail({ to: 'a@b.co', subject: 'Hi', html: '<p>Hi</p>' });

    expect(transport.sendMail.mock.calls[0][0]).not.toHaveProperty('text');
  });

  it('reports a rejected send rather than throwing', async () => {
    transport.sendMail.mockRejectedValue(new Error('Recipient address rejected'));

    await expect(
      emailService.sendEmail({ to: 'a@b.co', subject: 'Hi', html: '<p>Hi</p>' })
    ).resolves.toEqual({ success: false, message: 'Recipient address rejected' });
  });

  it('refuses to send while sending is switched off', async () => {
    getSettingByKey.mockResolvedValue(stored({ isEnabled: false }));

    await expect(
      emailService.sendEmail({ to: 'a@b.co', subject: 'Hi', html: '<p>Hi</p>' })
    ).resolves.toMatchObject({ success: false });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});

describe('sendTestEmail', () => {
  it('addresses the test to the configured sender', async () => {
    await emailService.sendTestEmail();

    expect(transport.sendMail.mock.calls[0][0]).toMatchObject({
      to: 'billing@example.com'
    });
  });
});

describe('EmailNotConfiguredError', () => {
  it('is distinguishable from an ordinary failure', () => {
    // The controller turns it into a 400 rather than a 500 — it is the
    // caller's configuration to fix, not a server fault.
    expect(new EmailNotConfiguredError('x')).toBeInstanceOf(Error);
    expect(new EmailNotConfiguredError('x').name).toBe('EmailNotConfiguredError');
  });
});

/**
 * EmailService (client) tests.
 *
 * SMTP now lives on the server, so this service is a client over /api/email and
 * what is worth testing is the contract with it: that a refused connection
 * comes back as an answer rather than an exception, that the sender address is
 * never sent from here, and that the account emails still carry the right
 * links — a reset link with the wrong token means nobody can reset a password,
 * and a literal {{user_name}} reaching a customer is the visible failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { authenticatedFetch } = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/utils/api', () => ({ authenticatedFetch }));

import { EmailService } from '@/services/email.svc';
import type { EmailTemplate } from '@/types';

/** Answers as the API does, with the standard envelope. */
const answers = (body: unknown, ok = true) => {
  authenticatedFetch.mockResolvedValue({
    ok,
    json: async () => body
  });
};

const lastCall = () => authenticatedFetch.mock.calls[authenticatedFetch.mock.calls.length - 1];
const lastBody = () => JSON.parse(String((lastCall()[1] as RequestInit).body));

let email: EmailService;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  email = EmailService.getInstance();
  answers({ success: true, data: { success: true, message: 'ok' } });
});

afterEach(() => vi.restoreAllMocks());

describe('getStatus', () => {
  it('reports what the server resolved', async () => {
    answers({
      success: true,
      data: {
        isEnabled: true, configured: true, missingFields: [], canSendEmails: true,
        host: 'smtp.example.com', port: 587, security: 'tls',
        user: 'billing@example.com', fromEmail: 'billing@example.com', fromName: 'Slimbooks'
      }
    });

    const status = await email.getStatus();

    expect(status.canSendEmails).toBe(true);
    expect(status.host).toBe('smtp.example.com');
    expect(lastCall()[0]).toBe('/api/email/status');
  });

  it('names the fields that are still missing', async () => {
    answers({
      success: true,
      data: {
        isEnabled: false, configured: false, missingFields: ['Password', 'From Email'],
        canSendEmails: false, host: 'smtp.example.com', port: 587, security: 'tls',
        user: '', fromEmail: '', fromName: ''
      }
    });

    await expect(email.getStatus()).resolves.toMatchObject({
      missingFields: ['Password', 'From Email']
    });
  });
});

describe('testConnection', () => {
  it('asks the server to open a real connection', async () => {
    await email.testConnection();

    expect(lastCall()[0]).toBe('/api/email/test-connection');
    expect((lastCall()[1] as RequestInit).method).toBe('POST');
  });

  it('passes a refused connection back as an answer, not an exception', async () => {
    // The settings screen has to be able to show why it failed.
    answers({ success: true, data: { success: false, message: 'Invalid login: 535 authentication failed' } });

    await expect(email.testConnection()).resolves.toEqual({
      success: false,
      message: 'Invalid login: 535 authentication failed'
    });
  });

  it('reports a request failure rather than throwing', async () => {
    answers({ success: false, error: 'Email is not configured - missing: Password' }, false);

    await expect(email.testConnection()).resolves.toMatchObject({
      success: false,
      message: /missing: Password/ as unknown as string
    });
  });

  it('survives a rejected request', async () => {
    authenticatedFetch.mockRejectedValue(new Error('offline'));

    await expect(email.testConnection()).resolves.toMatchObject({ success: false });
  });
});

describe('sendEmail', () => {
  it('sends the recipient, subject and both body parts', async () => {
    await email.sendEmail('client@example.com', 'Invoice INV-1', '<p>Hi</p>', 'Hi');

    expect(lastCall()[0]).toBe('/api/email/send');
    expect(lastBody()).toEqual({
      to: 'client@example.com',
      subject: 'Invoice INV-1',
      html: '<p>Hi</p>',
      text: 'Hi'
    });
  });

  it('never sends a sender address, which the server decides', async () => {
    await email.sendEmail('client@example.com', 'Subject', '<p>Hi</p>');

    expect(Object.keys(lastBody())).not.toContain('from');
  });

  it('reports a rejection rather than throwing', async () => {
    answers({ success: false, error: 'Email sending is switched off' }, false);

    await expect(email.sendEmail('a@b.co', 's', '<p>h</p>')).resolves.toEqual({
      success: false,
      message: 'Email sending is switched off'
    });
  });
});

describe('sendTestEmail', () => {
  it('asks the server to send to the configured sender', async () => {
    await email.sendTestEmail();

    expect(lastCall()[0]).toBe('/api/email/test');
  });
});

describe('the singleton', () => {
  it('shares one service across the app', () => {
    expect(EmailService.getInstance()).toBe(EmailService.getInstance());
  });
});

describe('sendTemplateEmail', () => {
  const template: EmailTemplate = {
    id: 0,
    name: 'test',
    subject: 'Hello {{user_name}}',
    html_content: '<p>Hi {{user_name}}, visit {{link}}</p>',
    text_content: 'Hi {{user_name}}, visit {{link}}',
    created_at: 0,
    updated_at: 0
  };

  it('substitutes every placeholder in subject and body', async () => {
    const spy = vi.spyOn(email, 'sendEmail')
      .mockResolvedValue({ success: true, message: 'ok' });

    await email.sendTemplateEmail('a@b.co', template, {
      user_name: 'Ada', link: 'https://example.com'
    });

    const [, subject, html, text] = spy.mock.calls[0];
    expect(subject).toBe('Hello Ada');
    expect(html).toContain('Hi Ada');
    expect(html).toContain('https://example.com');
    expect(text).toContain('Hi Ada');
  });

  it('replaces a placeholder used more than once', async () => {
    const spy = vi.spyOn(email, 'sendEmail')
      .mockResolvedValue({ success: true, message: 'ok' });

    await email.sendTemplateEmail(
      'a@b.co',
      { ...template, html_content: '<p>{{user_name}} and {{user_name}}</p>' },
      { user_name: 'Ada', link: 'x' }
    );

    expect(spy.mock.calls[0][2]).toBe('<p>Ada and Ada</p>');
  });

  it('handles a template with no text alternative', async () => {
    const spy = vi.spyOn(email, 'sendEmail')
      .mockResolvedValue({ success: true, message: 'ok' });

    await email.sendTemplateEmail(
      'a@b.co', { ...template, text_content: undefined }, { user_name: 'Ada', link: 'x' }
    );

    expect(spy.mock.calls[0][3]).toBe('');
  });

  it('reports failure rather than throwing on a malformed template', async () => {
    await expect(
      email.sendTemplateEmail('a@b.co', null as unknown as EmailTemplate, {})
    ).resolves.toMatchObject({ success: false });
  });
});

describe('account emails', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(email, 'sendEmail').mockResolvedValue({ success: true, message: 'ok' });
  });

  it('sends the verification link with the exact token', async () => {
    // A truncated or wrong token means nobody can ever verify their address.
    await email.sendVerificationEmail('ada@example.com', 'Ada', 'tok-abc123');

    const [to, subject, html, text] = spy.mock.calls[0];
    expect(to).toBe('ada@example.com');
    expect(subject).toMatch(/verify/i);
    expect(html).toContain('/verify-email?token=tok-abc123');
    expect(text).toContain('/verify-email?token=tok-abc123');
  });

  it('sends the reset link with the exact token', async () => {
    await email.sendPasswordResetEmail('ada@example.com', 'Ada', 'tok-reset-9');

    const [, subject, html, text] = spy.mock.calls[0];
    expect(subject).toMatch(/reset/i);
    expect(html).toContain('/reset-password?token=tok-reset-9');
    expect(text).toContain('/reset-password?token=tok-reset-9');
  });

  it('never puts a reset token in a verification email', async () => {
    await email.sendVerificationEmail('ada@example.com', 'Ada', 'tok-verify');

    expect(spy.mock.calls[0][2]).not.toContain('reset-password');
  });

  it('addresses the recipient by name', async () => {
    await email.sendVerificationEmail('ada@example.com', 'Ada Lovelace', 'tok');

    expect(spy.mock.calls[0][2]).toContain('Ada Lovelace');
  });

  it('points the welcome email at sign-in and carries no token', async () => {
    await email.sendWelcomeEmail('ada@example.com', 'Ada');

    const [, subject, html] = spy.mock.calls[0];
    expect(subject).toMatch(/welcome/i);
    expect(html).toContain('/login');
    expect(html).not.toContain('token=');
  });

  it('leaves no unsubstituted placeholders in any account email', async () => {
    // A literal {{user_name}} reaching a customer is the visible failure.
    await email.sendVerificationEmail('a@b.co', 'Ada', 'tok');
    await email.sendPasswordResetEmail('a@b.co', 'Ada', 'tok');
    await email.sendWelcomeEmail('a@b.co', 'Ada');

    for (const call of spy.mock.calls) {
      expect(String(call[1])).not.toMatch(/\{\{/);
      expect(String(call[2])).not.toMatch(/\{\{/);
      expect(String(call[3] ?? '')).not.toMatch(/\{\{/);
    }
  });

  it('always sends a plain-text alternative alongside the HTML', async () => {
    await email.sendVerificationEmail('a@b.co', 'Ada', 'tok');

    expect(String(spy.mock.calls[0][3])).not.toBe('');
  });
});

/**
 * `POST /api/email/send` recipient restriction.
 *
 * The endpoint takes the recipient, subject and HTML body straight from the
 * request. Authentication alone does not make that safe: on an install with
 * open signup, anyone could register and then send arbitrary markup to any
 * address on the internet, from this installation's domain, through its SMTP
 * credentials and against its sending reputation.
 *
 * The feature is "email an invoice or a reminder to a client", and every
 * genuine caller addresses a client row. Restricting delivery to addresses the
 * install already holds keeps that and removes the relay.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';

const isKnownRecipient = vi.fn();
const sendEmail = vi.fn();
const getStatus = vi.fn();

vi.mock('../services/EmailService.js', () => ({
  emailService: {
    isKnownRecipient: (address: string) => isKnownRecipient(address),
    sendEmail: (args: unknown) => sendEmail(args),
    getStatus: () => getStatus()
  }
}));

const { sendEmail: sendEmailController } = await import('./emailController.js');

const respond = () => {
  const res = { json: vi.fn() } as unknown as Response;
  return res;
};

/** Run the controller, returning whatever it threw (asyncHandler forwards it). */
const send = async (to: string): Promise<Error | null> => {
  const req = { body: { to, subject: 'Invoice INV-1', html: '<p>Hi</p>' } } as Request;
  const next = vi.fn();

  await (sendEmailController as unknown as (
    req: Request, res: Response, next: (error?: unknown) => void
  ) => Promise<void>)(req, respond(), next);

  return (next.mock.calls[0]?.[0] as Error) ?? null;
};

beforeEach(() => {
  vi.clearAllMocks();
  getStatus.mockResolvedValue({ canSendEmails: true, missingFields: [] });
  sendEmail.mockResolvedValue({ success: true, message: 'Email sent' });
});

describe('sendEmail recipient restriction', () => {
  it('refuses an address the installation does not know', async () => {
    isKnownRecipient.mockResolvedValue(false);

    const error = await send('victim@elsewhere.example');

    expect(error?.message).toMatch(/client or a user of this installation/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends to a known client', async () => {
    isKnownRecipient.mockResolvedValue(true);

    expect(await send('client@example.com')).toBeNull();
    expect(sendEmail).toHaveBeenCalled();
  });

  it('checks the recipient before the SMTP configuration, so the refusal does not depend on setup', async () => {
    isKnownRecipient.mockResolvedValue(false);
    getStatus.mockResolvedValue({ canSendEmails: false, missingFields: ['SMTP Host'] });

    const error = await send('victim@elsewhere.example');

    expect(error?.message).toMatch(/client or a user of this installation/);
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('still rejects a malformed address before looking it up', async () => {
    const error = await send('not-an-address');

    expect(error?.message).toMatch(/valid recipient address/i);
    expect(isKnownRecipient).not.toHaveBeenCalled();
  });
});

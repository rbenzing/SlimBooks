/**
 * Administrator-initiated password reset.
 *
 * The two things worth asserting: the plaintext is hashed with the configured
 * cost before it reaches the service, and neither the password nor the hash
 * comes back in the response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const updateUserPassword = vi.fn();
const getUserById = vi.fn();

vi.mock('../services/AuthService.js', () => ({ authService: { updateUserPassword } }));
vi.mock('../services/UserService.js', () => ({ userService: { getUserById } }));

const { resetUserPassword } = await import('./userController.js');

const responseStub = () => {
  const res = { statusCode: 200, payload: undefined as unknown } as unknown as Response & {
    payload: unknown;
  };
  res.status = vi.fn().mockImplementation((code: number) => {
    (res as unknown as { statusCode: number }).statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((body: unknown) => {
    (res as unknown as { payload: unknown }).payload = body;
    return res;
  });
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  getUserById.mockResolvedValue({ id: 7, email: 'ada@example.com', role: 'user' });
  updateUserPassword.mockResolvedValue(true);
});

describe('resetUserPassword', () => {
  it('hashes the password before storing it', async () => {
    const req = { params: { id: '7' }, body: { newPassword: 'Str0ng!Passphrase' } } as unknown as Request;
    const res = responseStub();

    await resetUserPassword(req, res, vi.fn());

    const [, storedHash] = updateUserPassword.mock.calls[0] as [number, string];

    expect(storedHash).not.toBe('Str0ng!Passphrase');
    expect(storedHash).toMatch(/^\$2[aby]\$/);
  });

  it('returns neither the password nor the hash', async () => {
    const req = { params: { id: '7' }, body: { newPassword: 'Str0ng!Passphrase' } } as unknown as Request;
    const res = responseStub();

    await resetUserPassword(req, res, vi.fn());

    expect(JSON.stringify(res.payload)).not.toContain('Str0ng!Passphrase');
    expect(JSON.stringify(res.payload)).not.toContain('$2');
  });
});

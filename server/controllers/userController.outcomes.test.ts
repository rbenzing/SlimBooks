/**
 * How a guarded mutation's outcome reaches the caller.
 *
 * The service answers `applied | refused | missing` and says nothing about
 * HTTP. Turning `refused` into **409** — not 400, not a 500 from a thrown
 * error the way the old string-matching controller did — is the branch's
 * headline behaviour, and until now it rested entirely on a manual walkthrough.
 *
 * `unlockUserAccount` is here for the same reason: it is one of the two new
 * endpoints and had no automated coverage at all.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const updateUser = vi.fn();
const deleteUser = vi.fn();
const unlockUser = vi.fn();
const getUserById = vi.fn();

vi.mock('../services/AuthService.js', () => ({ authService: { updateUserPassword: vi.fn() } }));
vi.mock('../services/UserService.js', () => ({
  userService: { updateUser, deleteUser, unlockUser, getUserById }
}));

const {
  updateUser: updateUserHandler,
  deleteUser: deleteUserHandler,
  unlockUserAccount
} = await import('./userController.js');

const responseStub = () => {
  const res = { statusCode: 200, payload: undefined as unknown } as unknown as Response & {
    statusCode: number;
    payload: unknown;
  };
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((body: unknown) => {
    res.payload = body;
    return res;
  });
  return res;
};

/**
 * `asyncHandler` forwards a thrown error to `next` rather than letting it
 * escape, so the assertions read what `next` was handed.
 */
const runHandler = async (
  handler: (req: Request, res: Response, next: (error?: unknown) => void) => Promise<void>,
  req: unknown
): Promise<{ res: ReturnType<typeof responseStub>; error: unknown }> => {
  const res = responseStub();
  let error: unknown;
  await handler(req as Request, res, (thrown?: unknown) => {
    error = thrown;
  });
  return { res, error };
};

const editRequest = (body: unknown, id = '1') => ({ params: { id }, body });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateUser outcomes', () => {
  it('maps a refusal to 409, with the message the screen shows the operator', async () => {
    updateUser.mockResolvedValue('refused');

    const { res, error } = await runHandler(
      updateUserHandler as never,
      editRequest({ userData: { role: 'user' } })
    );

    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(409);
    expect(res.payload).toMatchObject({ success: false });
    expect(String((res.payload as { error: string }).error)).toMatch(/only administrator/i);
  });

  it('maps a missing user to 404', async () => {
    updateUser.mockResolvedValue('missing');

    const { error } = await runHandler(
      updateUserHandler as never,
      editRequest({ userData: { name: 'Ada' } })
    );

    expect((error as { statusCode?: number }).statusCode).toBe(404);
  });

  it('answers 200 when the update applied', async () => {
    updateUser.mockResolvedValue('applied');

    const { res, error } = await runHandler(
      updateUserHandler as never,
      editRequest({ userData: { name: 'Ada' } })
    );

    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ success: true });
  });

  it('refuses a caller-supplied password hash rather than dropping it silently', async () => {
    // `createUser` 400s on the identical input, and the CHANGELOG says PUT no
    // longer accepts it. It used to be whitelisted away in silence.
    const { error } = await runHandler(
      updateUserHandler as never,
      editRequest({ userData: { password_hash: '$2b$10$notarealhash' } })
    );

    expect((error as { statusCode?: number }).statusCode).toBe(400);
    expect(String((error as Error).message)).toMatch(/not a hash/i);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rejects an unparseable id before reaching the service', async () => {
    const { error } = await runHandler(
      updateUserHandler as never,
      editRequest({ userData: { name: 'Ada' } }, 'abc')
    );

    expect((error as { statusCode?: number }).statusCode).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('turns the service errors it knows into 400s and 404s, not 500s', async () => {
    const cases: Array<[string, number]> = [
      ['User not found', 404],
      ['No valid fields to update', 400],
      ['Email is already in use', 400],
      ['User data is required', 400]
    ];

    for (const [message, statusCode] of cases) {
      vi.clearAllMocks();
      updateUser.mockRejectedValue(new Error(message));

      const { error } = await runHandler(
        updateUserHandler as never,
        editRequest({ userData: { name: 'Ada' } })
      );

      expect((error as { statusCode?: number }).statusCode).toBe(statusCode);
    }
  });
});

describe('deleteUser outcomes', () => {
  it('maps a refusal to 409', async () => {
    deleteUser.mockResolvedValue('refused');

    const { res, error } = await runHandler(deleteUserHandler as never, { params: { id: '1' } });

    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(409);
    expect(String((res.payload as { error: string }).error)).toMatch(/only administrator/i);
  });

  it('maps a missing user to 404', async () => {
    deleteUser.mockResolvedValue('missing');

    const { error } = await runHandler(deleteUserHandler as never, { params: { id: '404' } });

    expect((error as { statusCode?: number }).statusCode).toBe(404);
  });

  it('answers 200 when the row went', async () => {
    deleteUser.mockResolvedValue('applied');

    const { res, error } = await runHandler(deleteUserHandler as never, { params: { id: '1' } });

    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ success: true });
  });
});

describe('unlockUserAccount', () => {
  it('clears the lockout and reports it', async () => {
    unlockUser.mockResolvedValue(true);

    const { res, error } = await runHandler(unlockUserAccount as never, { params: { id: '7' } });

    expect(error).toBeUndefined();
    expect(unlockUser).toHaveBeenCalledWith(7);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ success: true });
  });

  it('answers 404 when no row was unlocked', async () => {
    unlockUser.mockResolvedValue(false);

    const { error } = await runHandler(unlockUserAccount as never, { params: { id: '404' } });

    expect((error as { statusCode?: number }).statusCode).toBe(404);
  });

  it('rejects an unparseable id before reaching the service', async () => {
    const { error } = await runHandler(unlockUserAccount as never, { params: { id: 'abc' } });

    expect((error as { statusCode?: number }).statusCode).toBe(400);
    expect(unlockUser).not.toHaveBeenCalled();
  });
});

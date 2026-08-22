import { authenticatedFetch } from '@/utils/api';
import { type ManagedUser, type UserFormData } from '@/types';

/**
 * The users API.
 *
 * A 409 from delete or update is not a transport failure — it is the server
 * refusing to leave the install without an administrator. It carries a message
 * written for the person reading it, so it is surfaced rather than replaced.
 */
const failureOf = async (response: Response, fallback: string): Promise<Error> => {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;

  return new Error(body?.error ?? fallback);
};

export const usersService = {
  async list(): Promise<ManagedUser[]> {
    const response = await authenticatedFetch('/api/users');

    if (!response.ok) throw await failureOf(response, 'Failed to load users');

    const body = (await response.json()) as { data: ManagedUser[] };
    return body.data;
  },

  async create(userData: UserFormData): Promise<number> {
    const response = await authenticatedFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({ userData })
    });

    if (!response.ok) throw await failureOf(response, 'Failed to create user');

    const body = (await response.json()) as { data: { id: number } };
    return body.data.id;
  },

  async update(id: number, userData: Partial<UserFormData>): Promise<void> {
    const response = await authenticatedFetch(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ userData })
    });

    if (!response.ok) throw await failureOf(response, 'Failed to update user');
  },

  async remove(id: number): Promise<void> {
    const response = await authenticatedFetch(`/api/users/${id}`, { method: 'DELETE' });

    if (!response.ok) throw await failureOf(response, 'Failed to delete user');
  },

  async resetPassword(id: number, newPassword: string): Promise<void> {
    const response = await authenticatedFetch(`/api/users/${id}/password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword })
    });

    if (!response.ok) throw await failureOf(response, 'Failed to reset password');
  },

  async unlock(id: number): Promise<void> {
    const response = await authenticatedFetch(`/api/users/${id}/unlock`, { method: 'POST' });

    if (!response.ok) throw await failureOf(response, 'Failed to unlock account');
  }
};

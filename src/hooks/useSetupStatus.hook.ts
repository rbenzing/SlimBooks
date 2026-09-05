// Whether this install still needs its first administrator.
//
// A fresh database has no admin — the old seed step used to create one from
// ADMIN_PASSWORD, defaulting to the literal string "password" when unset.
// This is the replacement signal App.tsx gates rendering on.

import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '@/utils/api';

export interface SetupStatus {
  needsSetup: boolean;
}

export const useSetupStatus = () =>
  useQuery<SetupStatus>({
    queryKey: ['setup-status'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/setup/status`);

      if (!response.ok) {
        throw new Error(`Failed to load setup status: HTTP ${response.status}`);
      }

      const result = await response.json();
      return result.data as SetupStatus;
    },
    // Flips at most once, at first-admin creation, which reloads into the
    // normal app rather than re-checking this in place.
    staleTime: Infinity,
    retry: 1
  });

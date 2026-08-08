// Runtime configuration for the SPA.
//
// The bundle is built once and deployed to any host, so which features exist
// is a runtime question. Without this the UI would offer a PDF button on a host
// with no Chromium, and the click would 404.

import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '@/utils/api';

export interface RuntimeConfig {
  appName: string;
  version: string;
  publicUrl: string;
  features: Record<string, boolean>;
}

export const useRuntimeConfig = () =>
  useQuery<RuntimeConfig>({
    queryKey: ['runtime-config'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/config`);

      if (!response.ok) {
        throw new Error(`Failed to load runtime configuration: HTTP ${response.status}`);
      }

      return response.json() as Promise<RuntimeConfig>;
    },
    // Host capabilities change only on redeploy, which reloads the page anyway.
    staleTime: Infinity,
    retry: 1
  });

/**
 * Root App component with all providers
 */
import { isNetworkError } from '@/lib/network-error';
import { useThemeStore } from '@/store/themeStore';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect, useMemo } from 'react';
import { RouterProvider } from 'react-router';
import { toast } from 'sonner';

import { PillarSdkProvider } from '@pops/pillar-sdk/react';
import { Toaster, TooltipProvider } from '@pops/ui';

import { BootRegistryProvider } from './BootRegistryProvider';
import { PillarStatusProvider } from './pillars';
import { buildRouter } from './router';

import type { BootRegistry } from './boot-snapshot';

const NETWORK_ERROR_TOAST_ID = 'network-down';

/**
 * Surface a toast only when the request never reached the server. Server-returned
 * 4xx/5xx errors keep their per-feature handling so this isn't toast spam.
 *
 * Note: queries retry on focus/remount by default, but mutations do not — so the
 * copy avoids claiming "retrying" and points the user at the next concrete step.
 */
function notifyNetworkError(err: unknown): void {
  if (!isNetworkError(err)) return;
  toast.error("Couldn't reach the server", {
    id: NETWORK_ERROR_TOAST_ID,
    description: 'Check your connection. The page will refresh once the server responds.',
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
  queryCache: new QueryCache({ onError: notifyNetworkError }),
  mutationCache: new MutationCache({ onError: notifyNetworkError }),
});

interface AppProps {
  /**
   * The boot-resolved install set (P7-T03). Resolved in `main.tsx` from the
   * live registry snapshot (or the static floor when the registry is
   * unreachable) before first render, then threaded in here.
   */
  readonly bootRegistry: BootRegistry;
}

export function App({ bootRegistry }: AppProps) {
  const theme = useThemeStore((state) => state.theme);

  // The install set is fixed for the lifetime of a session: the snapshot is
  // resolved once at boot, so the router is built once from those manifests.
  const router = useMemo(() => buildRouter(bootRegistry.manifests), [bootRegistry.manifests]);

  // Apply theme class to root element
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <PillarSdkProvider>
        <BootRegistryProvider value={bootRegistry}>
          <PillarStatusProvider>
            <TooltipProvider>
              <RouterProvider router={router} />
            </TooltipProvider>
          </PillarStatusProvider>
        </BootRegistryProvider>
        {!import.meta.env.VITE_E2E && <ReactQueryDevtools initialIsOpen={false} />}
        <Toaster />
      </PillarSdkProvider>
    </QueryClientProvider>
  );
}

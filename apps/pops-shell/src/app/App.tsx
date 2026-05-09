import { trpc, trpcClient } from '@/lib/trpc';
import { useThemeStore } from '@/store/themeStore';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { toast } from 'sonner';

/**
 * Root App component with all providers
 */
import { isNetworkError } from '@pops/api-client';
import { Toaster, TooltipProvider } from '@pops/ui';

import { router } from './router';

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

export function App() {
  const theme = useThemeStore((state) => state.theme);

  // Apply theme class to root element
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
        {!import.meta.env.VITE_E2E && <ReactQueryDevtools initialIsOpen={false} />}
        <Toaster />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

/**
 * Root App component with all providers
 */
import { Toaster, TooltipProvider } from '@pops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router';

import { trpc, trpcClient } from '@/lib/trpc';
import { useThemeStore } from '@/store/themeStore';

import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
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

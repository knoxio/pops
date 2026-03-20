/**
 * Root App component with all providers
 */
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { trpc, trpcClient } from "@/lib/trpc";
import { router } from "./router";
import { RouterProvider } from "react-router";
import { useThemeStore } from "@/store/themeStore";
import { Toaster, TooltipProvider } from "@pops/ui";

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
    document.documentElement.classList.toggle("dark", theme === "dark");
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

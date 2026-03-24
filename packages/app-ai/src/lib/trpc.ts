/**
 * tRPC client re-export for app-ai
 *
 * Creates typed tRPC hooks for the pops-api backend.
 * The Provider is owned by the shell (apps/pops-shell).
 */
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@pops/api";

export const trpc = createTRPCReact<AppRouter>();

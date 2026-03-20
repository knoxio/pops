/**
 * tRPC client re-export for app-media
 *
 * Creates typed tRPC hooks for the pops-api backend.
 * The Provider is owned by the shell (apps/pops-shell).
 *
 * TODO(tb-008): Consolidate with shell's tRPC setup to share a single React context.
 */
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@pops/api";

export const trpc = createTRPCReact<AppRouter>();

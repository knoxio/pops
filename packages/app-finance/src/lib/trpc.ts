/**
 * tRPC client re-export for app-finance
 *
 * This creates the typed tRPC hooks for the finance-api backend.
 * The Provider is owned by the shell (apps/pops-shell) — this module
 * is used here so that page-level imports resolve via the @/ alias.
 *
 * US-3 (tb-008) will consolidate this with the shell's trpc setup
 * to ensure a single React context is shared across packages.
 */
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@pops/finance-api";

export const trpc = createTRPCReact<AppRouter>();

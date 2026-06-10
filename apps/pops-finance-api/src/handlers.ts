/**
 * Request handlers for the finance pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express. Subsequent PRs add tRPC +
 * domain-specific handlers alongside the existing health probe.
 *
 * Mirrors `apps/pops-media-api/src/handlers.ts` minus any pillar-specific
 * surface.
 */

import type { OpenedFinanceDb } from '@pops/finance-db';

export interface FinanceApiDeps {
  /** Open handle to the finance pillar's SQLite. */
  financeDb: OpenedFinanceDb;
  /** Semver of the build, surfaced on the health response. */
  version: string;
}

export interface HealthResponse {
  ok: true;
  pillar: 'finance';
  version: string;
}

export function makeRequestHandler(deps: FinanceApiDeps): {
  health(): HealthResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error
      // (caught by the Express error pipeline -> 500) rather than a
      // bogus 200 OK that hides a broken connection.
      deps.financeDb.raw.prepare('SELECT 1').get();
      return { ok: true, pillar: 'finance', version: deps.version };
    },
  };
}

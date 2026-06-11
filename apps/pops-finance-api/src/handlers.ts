/**
 * Request handlers for the finance pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express. Phase 5 PR 1 (Track M2) adds
 * the optional `coreDb` dep so the tRPC context factory can authenticate
 * `X-API-Key` callers against the shared `core.db` service-accounts
 * table.
 */

import type { OpenedCoreDb } from '@pops/core-db';
import type { OpenedFinanceDb } from '@pops/finance-db';

export interface FinanceApiDeps {
  /** Open handle to the finance pillar's SQLite. */
  financeDb: OpenedFinanceDb;
  /**
   * Optional handle to the shared `core.db`. When present, finance-api's
   * tRPC context factory uses it to authenticate `X-API-Key` callers
   * against the service-accounts table so machine principals reach
   * finance endpoints with the same semantics they get from the legacy
   * pops-api router. When absent, only Cloudflare Access (or the
   * dev/tunnel fallbacks) is honoured — used by tests that don't
   * exercise SA auth.
   */
  coreDb?: OpenedCoreDb;
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

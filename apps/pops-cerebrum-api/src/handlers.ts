/**
 * Request handlers for the cerebrum pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express. Phase 3 PR 1 shipped the
 * `/health` probe; Phase 5 PR 1 (Track M5) adds the tRPC handler at
 * `/trpc` for the nudge_log read/dismiss surface. The `/uri/resolve`
 * handler lands in a subsequent slice-migration PR.
 */
import type { OpenedCerebrumDb } from '@pops/cerebrum-db';
import type { OpenedCoreDb } from '@pops/core-db';

export interface CerebrumApiDeps {
  /** Open handle to the cerebrum pillar's SQLite. */
  cerebrumDb: OpenedCerebrumDb;
  /**
   * Open handle to the core pillar's SQLite. Required for the
   * service-account authentication path (the canonical
   * `service_accounts` table lives on the core pillar). MUST be
   * writable — auth touches `service_accounts.last_used_at` per
   * request and `openCoreDb` applies migrations at boot. Mounting
   * `core.db` read-only will break both auth and boot.
   */
  coreDb: OpenedCoreDb;
  /** Semver of the build, surfaced on the health response. */
  version: string;
}

export interface HealthResponse {
  ok: true;
  pillar: 'cerebrum';
  version: string;
}

export function makeRequestHandler(deps: CerebrumApiDeps): {
  health(): HealthResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error
      // (caught by the Express error pipeline -> 500) rather than a
      // bogus 200 OK that hides a broken connection.
      deps.cerebrumDb.raw.prepare('SELECT 1').get();
      return { ok: true, pillar: 'cerebrum', version: deps.version };
    },
  };
}

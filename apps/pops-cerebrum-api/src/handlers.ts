/**
 * Request handlers for the cerebrum pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express. Phase 3 PR 1 ships only the
 * `/health` probe — the tRPC routers + `/uri/resolve` handler land in
 * subsequent slice-migration PRs.
 */
import type { OpenedCerebrumDb } from '@pops/cerebrum-db';

export interface CerebrumApiDeps {
  /** Open handle to the cerebrum pillar's SQLite. */
  cerebrumDb: OpenedCerebrumDb;
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

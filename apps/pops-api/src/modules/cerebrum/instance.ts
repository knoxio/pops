/**
 * Shared cerebrum runtime wiring.
 *
 * The engram root directory and template registry are process-scoped (config,
 * not per-request), so they live in module-level singletons. The Drizzle
 * instance is resolved per-call so env-scoped DB context (AsyncLocalStorage)
 * is honoured like every other module in this repo.
 */
import { join } from 'node:path';

import { getDrizzle } from '../../db.js';
import { getCerebrumDrizzle } from '../../db/cerebrum-handle.js';
import { ScopeRuleEngine } from './engrams/scope-rules.js';
import { EngramService } from './engrams/service.js';
import { TemplateRegistry } from './templates/registry.js';
import { seedDefaultTemplates } from './templates/seed.js';

function resolveRoot(): string {
  return process.env['ENGRAM_ROOT'] ?? join(process.cwd(), 'data', 'engrams');
}

let cachedRoot: string | null = null;
let cachedRegistry: TemplateRegistry | null = null;
let cachedScopeRuleEngine: ScopeRuleEngine | null = null;

/** Return the engram root directory. Cached after first resolve. */
export function getEngramRoot(): string {
  cachedRoot ??= resolveRoot();
  return cachedRoot;
}

/**
 * Return the shared template registry, seeding bundled defaults into the
 * engram root on first access.
 */
export function getTemplateRegistry(): TemplateRegistry {
  if (!cachedRegistry) {
    const templatesDir = join(getEngramRoot(), '.templates');
    try {
      seedDefaultTemplates(templatesDir);
    } catch (err) {
      console.warn(
        `[cerebrum] Failed to seed default templates into ${templatesDir}: ${(err as Error).message}`
      );
    }
    cachedRegistry = new TemplateRegistry(templatesDir);
  }
  return cachedRegistry;
}

/** Return the shared ScopeRuleEngine singleton. */
export function getScopeRuleEngine(): ScopeRuleEngine {
  cachedScopeRuleEngine ??= new ScopeRuleEngine(getEngramRoot());
  return cachedScopeRuleEngine;
}

/**
 * Build an EngramService bound to the current request's drizzle context.
 *
 * `db` is the shared `pops.db` handle (writes + read-after-write);
 * `readDb` is the cerebrum pillar's `cerebrum.db` handle (pure reads).
 * PRD-179 PR 2 — the read seam routes through `@pops/cerebrum-db`'s
 * `engramsService` against `readDb`; writes still land on `pops.db`
 * until PRD-179 US-03 flips them too. See `EngramService` top-of-file
 * JSDoc for the cross-store consistency contract.
 *
 * Blast radius: this is the single production factory, so every
 * consumer — user-facing routers (engrams, ingest, scopes), AI tools,
 * curation jobs, glia revert, nudges, ego context helpers — picks up
 * the `cerebrum.db`-backed read seam. That is the intended cutover
 * shape: keeping a parallel `pops.db` read path defeats the migration
 * and re-introduces the divergence the cutover is closing.
 *
 * Write-adjacent safety: read-after-write goes through the private
 * `loadEngram` (write store) so created/updated rows surface
 * immediately. The one cross-store existence check that gates writes
 * — `EngramService.exists`, used by glia revert — falls back to the
 * write store when the read store misses, so newly-written rows can
 * still be restored/unlinked before the next backfill. See the
 * `exists()` JSDoc for the contract.
 *
 * Tests inject a single in-memory SQLite via `new EngramService({ db,
 * ... })`; `readDb` defaults to `db` at the constructor so existing
 * harnesses keep working without churn.
 */
export function getEngramService(): EngramService {
  return new EngramService({
    root: getEngramRoot(),
    db: getDrizzle(),
    readDb: getCerebrumDrizzle(),
    templates: getTemplateRegistry(),
    scopeRuleEngine: getScopeRuleEngine(),
  });
}

/** Test hook — drop the cached root + registry so tests can rebind roots. */
export function resetCerebrumCache(): void {
  cachedRoot = null;
  cachedRegistry = null;
  cachedScopeRuleEngine = null;
}

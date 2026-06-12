/**
 * Shared cerebrum runtime wiring.
 *
 * The engram root directory and template registry are process-scoped (config,
 * not per-request), so they live in module-level singletons. The Drizzle
 * instance is resolved per-call so env-scoped DB context (AsyncLocalStorage)
 * is honoured like every other module in this repo.
 */
import { join } from 'node:path';

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
 * Build an EngramService bound to the current request's cerebrum
 * drizzle context.
 *
 * After PRD-179 PR 3 every engram path — reads (`list`, `read`,
 * `exists`) and writes (`create`, `update`, `archive`, `restore`,
 * `changeType`, `link`, `unlink`, `hardDelete`, `reindex`) — flows
 * through `getCerebrumDrizzle()` (`cerebrum.db`). The boot-time
 * backfill (`backfillCerebrumFromShared`) carries any residual rows on
 * the legacy shared `pops.db` forward on the first deploy after the
 * cut.
 *
 * Blast radius: this is the single production factory, so every
 * consumer — user-facing routers (engrams, ingest, scopes), AI tools,
 * curation jobs, glia revert, nudges, ego context helpers — picks up
 * the cerebrum handle uniformly.
 *
 * Tests inject a single in-memory SQLite as `db` and the same handle
 * satisfies the cerebrum-pillar contract.
 */
export function getEngramService(): EngramService {
  return new EngramService({
    root: getEngramRoot(),
    db: getCerebrumDrizzle(),
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

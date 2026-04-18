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
import { EngramService } from './engrams/service.js';
import { TemplateRegistry } from './templates/registry.js';
import { seedDefaultTemplates } from './templates/seed.js';

function resolveRoot(): string {
  return process.env['ENGRAM_ROOT'] ?? join(process.cwd(), 'data', 'engrams');
}

let cachedRoot: string | null = null;
let cachedRegistry: TemplateRegistry | null = null;

/** Return the engram root directory. Cached after first resolve. */
export function getEngramRoot(): string {
  if (!cachedRoot) cachedRoot = resolveRoot();
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

/** Build an EngramService bound to the current request's drizzle context. */
export function getEngramService(): EngramService {
  return new EngramService({
    root: getEngramRoot(),
    db: getDrizzle(),
    templates: getTemplateRegistry(),
  });
}

/** Test hook — drop the cached root + registry so tests can rebind roots. */
export function resetCerebrumCache(): void {
  cachedRoot = null;
  cachedRegistry = null;
}

/**
 * Canonical list of pillars (ADR-026, pillar-migration P1).
 *
 * Each pillar will eventually own a `packages/<id>-db/` package containing
 * its drizzle schema + migrations + journal. The per-pillar migration
 * runner walks this list at boot to discover and apply each pillar's
 * journal independently of the shared `apps/pops-api/src/db/drizzle-migrations/`
 * journal.
 *
 * Pillar order in this list controls the *boot-time* application order
 * when multiple pillars' journals are present. Today every entry is
 * essentially a no-op (no `<id>-db` package exists yet) — but the order is
 * preserved against the day each pillar's Phase 1 split lands. Core comes
 * first because every other pillar depends on core's pillar registry at
 * runtime (the migrations don't depend on it, but the ordering is the
 * single source of truth so it stays consistent with the runtime story
 * documented in ADR-026).
 *
 * **`ai` was folded into core** during Phase γ (2026-06-10). `packages/app-ai/`
 * remains as a UI shell — admin/observability for AI Ops — but its backend
 * services (`apps/pops-api/src/modules/core/{ai-budgets,ai-observability,
 * ai-alerts,ai-usage,ai-providers}`) and every AI migration
 * (`0034_ai_observability` through `0056_ai_observability_repair`) already
 * live in the core pillar's domain. There is no `packages/ai-db/` to build
 * and no `pops-ai-api` container to scaffold; the entry is dropped here so
 * the per-pillar runner doesn't probe for a non-existent package. The
 * shell's `pillarIdForModule('ai')` returns `'core'` (default behaviour).
 *
 * @see .claude/pillar-migration-roadmap.md (Track I — ai folds into core)
 */

/** A single pillar's static metadata. */
export interface PillarDescriptor {
  /** Pillar id, matches the prefix used in the `<id>-db` package path. */
  readonly id: string;
  /** Workspace-relative path (no trailing slash) to the pillar's db package. */
  readonly dbPackageDir: string;
}

/**
 * Build a {@link PillarDescriptor} from a pillar id. Trivial helper kept
 * so the path convention has one definition; if it ever needs to
 * accommodate variants (e.g. an experimental pillar that lives somewhere
 * other than `packages/<id>-db/`), only this function changes.
 */
function pillar(id: string): PillarDescriptor {
  return { id, dbPackageDir: `packages/${id}-db` };
}

/**
 * Canonical pillar list, in boot-time migration-apply order. Adding a new
 * pillar = adding a new entry here AND creating its `<id>-db` package.
 *
 * Removed 2026-06-10: `ai`. AI Ops is owned by the core pillar — no
 * separate `packages/ai-db/` was ever created and every AI migration was
 * authored against core's shared journal. The `app-ai` UI shell continues
 * to consume `core`'s tRPC surface unchanged.
 */
export const KNOWN_PILLARS: readonly PillarDescriptor[] = [
  pillar('core'),
  pillar('finance'),
  pillar('media'),
  pillar('inventory'),
  pillar('cerebrum'),
  pillar('food'),
  pillar('lists'),
];

/** Set view of pillar ids for O(1) membership checks. */
export const KNOWN_PILLAR_IDS: ReadonlySet<string> = new Set(KNOWN_PILLARS.map((p) => p.id));

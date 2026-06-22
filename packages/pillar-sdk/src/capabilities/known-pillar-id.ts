/**
 * Canonical list of pillar ids known to the SDK.
 *
 * The long-term home for this list is PRD-156's import discipline rule —
 * once that lands the constant will be re-sourced from there and this file
 * becomes a re-export. Keeping the list local in the interim lets PRD-160
 * ship its `KnownPillarId` projection without taking a build-time dependency
 * on a not-yet-shipped sibling PRD.
 *
 * The set started from the seven pillars ADR-026 carves the platform into;
 * `contacts` (the first Rust pillar) extends it as the canonical entities
 * store extracted out of the registry pillar; `ai` is a first-class pillar as
 * of PRD-055, extracting the AI-ops backend (observability, providers,
 * budgets, alerts, the cross-pillar telemetry ingest) out of it.
 * The `registry` pillar (formerly `core`) is the platform registry /
 * discovery / settings host.
 * Adding a new pillar = add a string here → every consumer that types a
 * pillar id against `KnownPillarId` updates at compile time.
 */
export const PILLARS = [
  'registry',
  'finance',
  'media',
  'inventory',
  'cerebrum',
  'food',
  'lists',
  'contacts',
  'ai',
] as const;

/**
 * Closed union over the in-tree pillars (build-time tier).
 *
 * Use `KnownPillarId` where a missing entry *should* fail the build: the
 * nginx upstream map (`Record<KnownPillarId, …>`), `MODULE_PARENT_PILLAR`,
 * and the typed `pillar<P extends KnownPillarId>()` projection (PRD-160).
 * Adding a `pillars/<x>/` without wiring it here becomes a compile error —
 * that guard rail is deliberate and stays.
 */
export type KnownPillarId = (typeof PILLARS)[number];

/**
 * Open pillar id (runtime tier) — a plain `string` alias, intentionally
 * *not* a brand, because registry/runtime ids are genuinely open and a
 * brand would force a cast at every registry boundary.
 *
 * Use `PillarId` on every surface fed by the runtime registry: registry
 * snapshot entries, the nginx render's pillar set, routing/dispatch, and
 * the shell's nav/app-context. A pillar the build has never heard of
 * (a runtime/registry/LAN registration per PRD-228/PRD-242) is expressible
 * here without a compile error.
 *
 * The seam between the two tiers is the existing
 * `isKnownPillarId(id): id is KnownPillarId` guard — a real narrowing, not
 * an `as`-widening. Narrow a `PillarId` to `KnownPillarId` through that
 * guard wherever a closed-set operation (docker upstream lookup,
 * parent-pillar table) is required; the open path otherwise routes via the
 * registry `baseUrl`.
 *
 * Two-tier rule (PRD-256):
 * - **closed** `KnownPillarId` on `PILLAR_UPSTREAMS`, `MODULE_PARENT_PILLAR`,
 *   and the typed `pillar()` projection (PRD-160, unchanged);
 * - **open** `PillarId` on registry / routing / nav.
 */
export type PillarId = string;

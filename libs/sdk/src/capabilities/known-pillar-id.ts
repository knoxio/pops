/**
 * Curated runtime list of the pillar ids that ship in this tree.
 *
 * This is a *value*, not the source of a closed type. It is the canonical
 * "pillars baked into this build" list that runtime code legitimately needs:
 * the nginx generator's coverage assert (`assertRenderOrderCoversAllPillars`)
 * and the `isKnownPillarId` narrowing guard both check membership against it.
 * Adding a pillar to the tree means adding a string here so those runtime
 * surfaces stay in sync — but it is no longer a *type* edit (see
 * `KnownPillarId` below): a pillar the build has never heard of is a valid
 * `KnownPillarId` at compile time, and `isKnownPillarId` is the runtime seam
 * that tells the curated set apart from an arbitrary registry id.
 *
 * The set started from the seven pillars ADR-026 carves the platform into;
 * `contacts` (the first Rust pillar) extends it as the canonical entities
 * store extracted out of the registry pillar; `ai` is a first-class pillar as
 * of PRD-055, extracting the AI-ops backend (observability, providers,
 * budgets, alerts, the cross-pillar telemetry ingest) out of it.
 * The `registry` pillar (formerly `core`) is the platform registry /
 * discovery / settings host.
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
 * Open pillar id — a plain `string` alias, intentionally *not* a brand,
 * because registry/runtime ids are genuinely open and a brand would force a
 * cast at every registry boundary.
 *
 * Use `PillarId` on every surface fed by the runtime registry: registry
 * snapshot entries, the nginx render's pillar set, routing/dispatch, and
 * the shell's nav/app-context. A pillar the build has never heard of
 * (a runtime/registry/LAN registration per PRD-228/PRD-242) is expressible
 * here without a compile error.
 */
export type PillarId = string;

/**
 * Pillar id known to the SDK — now an alias of the open {@link PillarId}.
 *
 * RD-9 (POPS federation) collapsed the formerly-closed compile-time tier:
 * `KnownPillarId` no longer derives from the {@link PILLARS} tuple, so adding
 * a pillar to the tree (or registering one at runtime over the LAN) needs no
 * type edit — the registry is the sole source of truth for which pillars
 * exist. The two-tier *runtime* seam is unchanged: `isKnownPillarId(id)`
 * narrows an arbitrary string by checking membership of the curated
 * {@link PILLARS} value, which is still the right gate for build-time
 * surfaces (the nginx upstream map, the render-order coverage assert) that
 * must enumerate the in-tree pillars.
 *
 * Kept as a distinct name (rather than replacing every use with `PillarId`)
 * so call sites that document "this should be a pillar the build curates"
 * stay self-describing; both resolve to `string`.
 */
export type KnownPillarId = PillarId;

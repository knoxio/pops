/**
 * Canonical list of pillar ids known to the SDK.
 *
 * The long-term home for this list is PRD-156's import discipline rule —
 * once that lands the constant will be re-sourced from there and this file
 * becomes a re-export. Keeping the list local in the interim lets PRD-160
 * ship its `KnownPillarId` projection without taking a build-time dependency
 * on a not-yet-shipped sibling PRD.
 *
 * The set matches the seven pillars ADR-026 carves the platform into.
 * AI Ops is intentionally NOT a pillar — it lives inside `core`.
 * Adding a new pillar = add a string here → every consumer that types a
 * pillar id against `KnownPillarId` updates at compile time.
 */
export const PILLARS = [
  'core',
  'finance',
  'media',
  'inventory',
  'cerebrum',
  'food',
  'lists',
] as const;

export type KnownPillarId = (typeof PILLARS)[number];

/**
 * Pillars that still get their own dedicated `/trpc-<id>` batch URL.
 *
 * Every pillar has now migrated to a REST contract, so none is split out
 * to a per-pillar tRPC upstream — the list is empty. The few cross-cutting
 * procedures the REST cutover has not yet absorbed (global search, the
 * shell nudge bell) keep flowing to the legacy `/trpc` catch-all on the
 * monolith via the split-link's fallback branch.
 *
 * Used by the shell's split-link + the shared api-client split-link to
 * decide which namespaces get a dedicated batch URL. If a pillar ever
 * needs its own tRPC upstream again, add its id here (and adjust the
 * `_assert` below so any new pillar id added to {@link PILLARS} forces a
 * deliberate choice about its transport).
 */
export const TRPC_PILLARS = [] as const satisfies readonly KnownPillarId[];

export type TrpcPillarId = (typeof TRPC_PILLARS)[number];

type _AssertTrpcSubsetOfKnown = TrpcPillarId extends KnownPillarId ? true : never;
const _assertTrpcSubset: _AssertTrpcSubsetOfKnown = true;
void _assertTrpcSubset;

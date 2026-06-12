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

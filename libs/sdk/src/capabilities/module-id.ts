/**
 * Module-id projections — superset of `KnownPillarId` that includes the one
 * remaining transitional sub-module id the shell still routes on (`ego`).
 *
 * Per ADR-026 the platform is carved into pillars: `core`, `finance`, `media`,
 * `inventory`, `cerebrum`, `food`, `lists`, `contacts`, and `ai` (a first-class
 * pillar as of PRD-055). Ego is a sub-system of `cerebrum` — it is NOT a pillar.
 * `@pops/module-registry`'s build-time `KNOWN_MODULES` still emits it as a
 * routable id because the shell, the settings UI, and a handful of cross-pillar
 * URI consumers have not yet folded it into its parent pillar.
 *
 * The `ego` entry here is transitional. Once the FE migration tracked under
 * PRD-218 completes and every routable surface dispatches on the parent pillar,
 * it drops out of the SDK and `ModuleId` collapses back into `KnownPillarId`.
 */

import { PILLARS, type KnownPillarId } from './known-pillar-id.js';

/**
 * Canonical superset of routable module ids: every `KnownPillarId` (the
 * `PILLARS` set, including `contacts` and `ai`) plus the one remaining
 * transitional sub-module id (`ego`). The test in `__tests__/modules.test.ts`
 * pins this to `PILLARS + {ego}`.
 *
 * This is deliberately NOT in lock-step with `@pops/module-registry`'s
 * build-time `KNOWN_MODULES`. That registry is manifest-driven — it only
 * lists pillars that ship a JS/TS contract with a `./manifest` export.
 * `contacts` is a Rust pillar with no such manifest yet, so it is a routable
 * pillar id here but absent from `KNOWN_MODULES` until it gains a TS manifest
 * in N1+.
 */
export const ALL_MODULE_IDS = [
  'ai',
  'cerebrum',
  'contacts',
  'ego',
  'finance',
  'food',
  'inventory',
  'lists',
  'media',
  'registry',
] as const;

/**
 * Union of every routable module id. Superset of `KnownPillarId` that adds
 * the two transitional sub-module ids (`ai`, `ego`).
 */
export type ModuleId = (typeof ALL_MODULE_IDS)[number];

/**
 * Runtime type guard narrowing an arbitrary string to `KnownPillarId`.
 * Use at the boundary of untyped inputs (URL params, env vars, untyped
 * tRPC inputs) before routing on the value.
 */
export function isKnownPillarId(id: string): id is KnownPillarId {
  return (PILLARS as readonly string[]).includes(id);
}

/**
 * Runtime type guard narrowing an arbitrary string to the `ModuleId`
 * superset (pillars + `ai` + `ego`).
 */
export function isModuleId(id: string): id is ModuleId {
  return (ALL_MODULE_IDS as readonly string[]).includes(id);
}

/**
 * Maps every `ModuleId` to its owning pillar. Pillars map to themselves
 * (`ai → ai` now that AI Ops is a first-class pillar per PRD-055);
 * `ego → cerebrum` per ADR-026.
 *
 * Used by routers and the shell to dispatch a sub-module id onto the
 * pillar that physically owns its contract.
 */
export const MODULE_PARENT_PILLAR: Record<ModuleId, KnownPillarId> = {
  ai: 'ai',
  cerebrum: 'cerebrum',
  contacts: 'contacts',
  ego: 'cerebrum',
  finance: 'finance',
  food: 'food',
  inventory: 'inventory',
  lists: 'lists',
  media: 'media',
  registry: 'registry',
};

/**
 * Module-id projections — superset of `KnownPillarId` that includes the two
 * transitional sub-module ids the shell still routes on (`ai`, `ego`).
 *
 * Per ADR-026 the platform is carved into seven pillars: `core`, `finance`,
 * `media`, `inventory`, `cerebrum`, `food`, `lists`. AI Ops (`ai`) is a
 * sub-system of `core`; Ego is a sub-system of `cerebrum`. They are NOT
 * pillars. However `@pops/module-registry`'s build-time `KNOWN_MODULES`
 * still emits them as routable ids because the shell, the settings UI, and
 * a handful of cross-pillar URI consumers have not yet folded them into
 * their parent pillars.
 *
 * The `ai` and `ego` entries here are transitional. Once the FE migration
 * tracked under PRD-218 completes and every routable surface dispatches on
 * the parent pillar, these two ids drop out of the SDK and `ModuleId`
 * collapses back into `KnownPillarId`.
 */

import { PILLARS, type KnownPillarId } from './known-pillar-id.js';

/**
 * Canonical superset of routable module ids. Matches the order and
 * contents of `@pops/module-registry`'s `KNOWN_MODULES` — kept in lock-step
 * by the test in `__tests__/modules.test.ts`.
 */
export const ALL_MODULE_IDS = [
  'ai',
  'cerebrum',
  'core',
  'ego',
  'finance',
  'food',
  'inventory',
  'lists',
  'media',
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
 * Maps every `ModuleId` to its owning pillar. Pillars map to themselves;
 * `ai → core` and `ego → cerebrum` per ADR-026.
 *
 * Used by routers and the shell to dispatch a sub-module id onto the
 * pillar that physically owns its contract.
 */
export const MODULE_PARENT_PILLAR: Record<ModuleId, KnownPillarId> = {
  ai: 'core',
  cerebrum: 'cerebrum',
  core: 'core',
  ego: 'cerebrum',
  finance: 'finance',
  food: 'food',
  inventory: 'inventory',
  lists: 'lists',
  media: 'media',
};

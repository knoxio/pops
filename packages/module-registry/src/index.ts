/**
 * @pops/module-registry — build-time module registry (PRD-101 US-02).
 *
 * Re-exports the generated `MODULES` constant aggregating every installed
 * module manifest, plus consumer helpers. The aggregation logic, validation,
 * and emission live in `scripts/build.ts`; this entry point is read-only at
 * runtime and tree-shakeable.
 *
 * The `MODULES` constant is `as const` so consumers narrow on the exact
 * installed module-id union via `(typeof MODULES)[number]['id']`.
 */
export { KNOWN_MODULES, MODULES } from './generated.js';

import { MODULES } from './generated.js';

/**
 * Exact union of installed module ids. Narrows automatically when a module
 * is removed from `KNOWN_MODULES` or excluded by `POPS_APPS` /
 * `POPS_OVERLAYS` at build time.
 */
export type ModuleId = (typeof MODULES)[number]['id'];

/**
 * Single registry entry — the runtime shape consumers see when iterating
 * over `MODULES`. Mirrors the `as const` projection emitted by the build
 * script (`scripts/build.ts`).
 */
export type RegisteredModule = (typeof MODULES)[number];

/**
 * Find an installed module by id. Returns `undefined` when the id is not in
 * the install set — call sites are expected to handle "module absent" as a
 * first-class state (placeholder UI, NOT_FOUND, etc.) rather than throwing.
 *
 * The narrow `ModuleId` overload exists so call sites that already hold an
 * id of the union type get a non-`undefined` return.
 */
export function findModule(id: ModuleId): RegisteredModule;
export function findModule(id: string): RegisteredModule | undefined;
export function findModule(id: string): RegisteredModule | undefined {
  return MODULES.find((m) => m.id === id);
}

/**
 * Type guard: narrows an arbitrary string to `ModuleId` when it matches a
 * registered module id. Useful at the boundary of untyped inputs (env
 * vars, URLs, tRPC inputs) before passing the value to downstream APIs
 * that expect the narrow type.
 */
export function isModuleId(value: string): value is ModuleId {
  return MODULES.some((m) => m.id === value);
}

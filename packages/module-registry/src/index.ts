/**
 * @pops/module-registry — build-time module registry (PRD-101 US-02) with
 * a runtime install-set shim layered on top (PRD-218 US-01).
 *
 * `MODULES` / `KNOWN_MODULES` come from `generated.ts` and reflect the set
 * of modules selected at registry build time (see `scripts/build.ts`).
 *
 * `INSTALLED_MODULES` / `isInstalledModule` re-evaluate `POPS_APPS` /
 * `POPS_OVERLAYS` at module-load time so consumers that need the live
 * install set (per-deploy gating) do not have to read `process.env`
 * themselves and risk semantic drift. The runtime shim is necessary
 * because a single registry build is reused across deploys that may scope
 * the install set differently via env.
 *
 * The `MODULES` constant is `as const` so consumers narrow on the exact
 * installed module-id union via `(typeof MODULES)[number]['id']`.
 */
export { KNOWN_MODULES, MODULES } from './generated.js';

import { MODULES, KNOWN_MODULES } from './generated.js';
import { resolveInstalledIds } from './install-set.js';

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
 * Type-level pair for the runtime `INSTALLED_MODULES` shim (PRD-218 US-02).
 *
 * Structurally identical to `RegisteredModule`, but named to match the
 * `INSTALLED_MODULES` runtime export so consumers that need the build-time
 * install-set shape at the type level can read `InstalledModule` instead of
 * re-deriving `(typeof MODULES)[number]` at every call site.
 *
 * Runtime `POPS_APPS` / `POPS_OVERLAYS` narrowing cannot reflect into the
 * type system without per-deploy codegen, so this alias still resolves to
 * the build-time superset (same as `RegisteredModule`). It exists to give
 * downstream code (e.g. `apps/pops-api/src/router.ts`) a stable, semantic
 * name aligned with the install-set vocabulary.
 */
export type InstalledModule = (typeof MODULES)[number];

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

/**
 * `core` is the always-mounted platform shell (PRD-100). It stays in the
 * runtime install set even when `POPS_APPS` would otherwise exclude it.
 */
const ALWAYS_INSTALLED: readonly string[] = ['core'];

interface MaybeProcess {
  readonly env?: Readonly<Record<string, string | undefined>>;
}

function readEnv(): Readonly<Record<string, string | undefined>> {
  const globals: { process?: MaybeProcess } = globalThis;
  return globals.process?.env ?? {};
}

/**
 * Runtime-filtered module ids. Computed once at module load from
 * `POPS_APPS` / `POPS_OVERLAYS` against the build-time `KNOWN_MODULES`
 * superset. Unset env → returns `KNOWN_MODULES` verbatim.
 *
 * This is the export PRD-218 batch-2 consumers should switch to when they
 * need "is this module live on this deploy?". They previously read
 * `KNOWN_MODULES` directly and re-implemented the env gate inline.
 */
export const INSTALLED_MODULES: readonly string[] = resolveInstalledIds(
  KNOWN_MODULES,
  readEnv(),
  ALWAYS_INSTALLED
);

/**
 * Runtime equivalent of `isModuleId`. Returns true only when `id` is in
 * the per-deploy install set computed from `POPS_APPS` / `POPS_OVERLAYS`.
 *
 * Prefer this over `isModuleId` for install-set gating (feature
 * availability, navigation, search adapter dispatch). Use `isModuleId`
 * when you need the type-level narrowing to `ModuleId`.
 */
export function isInstalledModule(value: string): boolean {
  return INSTALLED_MODULES.includes(value);
}

# US-02: Build-time module registry

> PRD: [Plugin Contract](README.md)
> Status: Done

## Description

As a platform engineer, I want a single typed `MODULES` constant aggregating every installed manifest so that the shell, API, and every cross-cutting concern can read from one source instead of registering themselves via side-effect imports.

## Acceptance Criteria

- [x] New package `@pops/module-registry` exists with one entry point: `export const MODULES: readonly ModuleManifest[]` and `export const KNOWN_MODULES: readonly string[]`.
- [x] Generator script `pnpm registry:build` (in `packages/module-registry/scripts/build.ts`) reads `KNOWN_MODULES` (a fixed list at the top of the script), imports each module's `manifest`, validates via `assertModuleManifest()`, and emits `packages/module-registry/src/generated.ts`.
- [x] The generated file is committed. CI runs `pnpm registry:build` and fails if the output differs from the committed file (drizzle-style guard).
- [x] Turbo task graph wires `registry:build` as a dependency of `build` and `dev` for every consumer package.
- [x] `MODULES` is `as const`-typed so consumers get the exact installed module-id union in their types.
- [x] Generator fails with a clear error naming the module if: a manifest fails validation; a `dependsOn` references an absent module; two `uriHandler.types` collide; a manifest id duplicates another.
- [x] Generator respects the env contract: when `POPS_APPS` / `POPS_OVERLAYS` are set, the generated `MODULES` only contains the listed ids (intersected with `KNOWN_MODULES`).
- [x] Default behaviour (env unset): `MODULES` contains every entry of `KNOWN_MODULES`. Preserves PRD-100 default.

## Notes

- Codegen — not dynamic — so type inference is exact and bundlers can tree-shake absent modules.
- This US wires the plumbing only; existing registries (settings, features, search) keep working unchanged. Their consumer migration lands in US-03..US-10.
- `core` is always present and is not part of `KNOWN_MODULES` (matches PRD-100's treatment of core as the platform shell, not a module).
- The generator is the right place to fail loud on contract violations because the alternative — runtime errors after partial boot — is harder to debug.
- The committed `generated.ts` carries metadata-only fields (id, name, surfaces, description, capabilities, dependsOn, overlay slot) — code-bearing slots (`backend.router`, `frontend.routes`, handler functions) are intentionally elided so `@pops/module-registry` does not need to depend on every app. Consumer wiring in US-03..US-10 re-attaches the live references at the call site, keyed by the registry's `ModuleId` union. Migrating the source-of-truth list to live imports of each module's `manifest` is a follow-up once each module exposes a manifest-only entry point.

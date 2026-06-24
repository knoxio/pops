# Module Import Boundaries

> Epic: [Modular Module Runtime](../../epics/modular-module-runtime.md)
> Status: Done

## Overview

Every unit in the workspace — each `pillars/<id>/` and each `libs/<name>/` — is a black box that must be extractable into its own repository without dragging a peer along. Import discipline is what makes that true. A pillar may consume another pillar only through its published contract package and its REST API; it may never reach across the filesystem into a peer's internals. A lib facilitates pillars and must never depend on one. Leaf libs sit at the extraction floor and depend on nothing.

These boundaries are honour-system without a gate. This PRD makes them lint-enforced: a single `.dependency-cruiser.cjs` at the repo root encodes the rule set, `pnpm lint:boundaries` runs it, a known-violations baseline grandfathers the violations that exist at land time, and a CI job blocks merge on any new violation. The baseline may only ever shrink.

## Units & Boundaries

The workspace has two unit kinds. There is no `apps/` directory, no `pops-api` monolith, no `packages/*`.

| Unit kind       | Path                | Role                                                                                        |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| Pillar          | `pillars/<id>/`     | Owns its SQLite DB, serves a ts-rest+zod (or axum+OpenAPI) contract, self-registers on boot |
| Pillar frontend | `pillars/<id>/app/` | The pillar's SPA, published as `@pops/app-<id>`                                             |
| Lib             | `libs/<name>/`      | Shared cross-pillar code; published as `@pops/<name>` (the SDK is `@pops/pillar-sdk`)       |

The boundary rules, by the actual rule names that appear in CI output:

| Rule                       | From                                                               | Forbidden target                                                                                    |
| -------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `lib-no-pillar-import`     | `libs/**`                                                          | Any `pillars/**` path, any `@pops/<pillar>` contract package, any `@pops/app-*`                     |
| `pillar-no-cross-internal` | `pillars/<x>/**`                                                   | `pillars/<y>/**` by filesystem path where x ≠ y (consume the peer's `@pops/<y>` package instead)    |
| `no-deep-internal-import`  | anywhere                                                           | `@pops/<pkg>/(src\|dist\|lib\|internal)/...` — a subpath the package's exports map does not declare |
| `no-circular`              | anywhere                                                           | any cyclic dependency between modules                                                               |
| `lib-layering`             | leaf libs (`types`, `db-types`, `sdk`, `settings`, `ai-telemetry`) | any `@pops/*` outside the leaf set                                                                  |

A pillar consumes another pillar's **types** through its published `@pops/<id>` package (contract types + api-types + OpenAPI) and makes **calls** through the pillar's REST API via the `pillar()` SDK helper. Cross-pillar frontend communication is the same: through REST or shared libs, never a direct import of a peer pillar's `app/`.

### Allow-listed shared libs for pillar frontends

A pillar frontend (`pillars/<id>/app/`) may import any shared lib (none of the rules forbid `libs/**` → `libs/**` from a pillar frontend). The libs in production use for frontends are:

- `@pops/ui`
- `@pops/navigation`
- `@pops/types`
- `@pops/db-types`

This list is encoded in the `.dependency-cruiser.cjs` header comment for discoverability, not as a separate forbidding rule. Adding a new shared lib needs no rule change; the lib's own boundaries (`lib-no-pillar-import`, `lib-layering`) keep it extractable.

### Dead-package tombstones

The lake-migration collapsed every per-pillar `*-db` / `*-contract` / `*-api` package and the `pops-api` monolith into `pillars/<id>/`. The retired specifiers are tombstoned so no new code re-imports them; consumers go through the live `@pops/<id>` package and the REST API instead. One rule per retired family:

| Rule                        | Tombstoned specifiers                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `no-dead-lists-pkgs`        | `@pops/app-lists-db`, `@pops/lists-db`, `@pops/lists-contract`, `@pops/lists-api`                     |
| `no-dead-inventory-pkgs`    | `@pops/app-inventory-db`, `@pops/inventory-db`, `@pops/inventory-contract`, `@pops/inventory-api`     |
| `no-dead-food-pkgs`         | `@pops/app-food-db`, `@pops/food-db`, `@pops/food-contract`, `@pops/food-contracts`, `@pops/food-api` |
| `no-dead-finance-pkgs`      | `@pops/app-finance-db`, `@pops/finance-db`, `@pops/finance-contract`, `@pops/finance-api`             |
| `no-dead-cerebrum-pkgs`     | `@pops/cerebrum-db`, `@pops/cerebrum-contract`, `@pops/cerebrum-api`                                  |
| `no-dead-media-pkgs`        | `@pops/app-media-db`, `@pops/media-db`, `@pops/media-contract`, `@pops/media-api`                     |
| `no-dead-core-pkgs`         | `@pops/core-db`, `@pops/core-contract`, `@pops/core-api` (core is now `pillars/registry/`)            |
| `no-dead-shared-schema-pkg` | `@pops/shared-schema` (each pillar owns a byte-compatible local copy of its tables)                   |

## Tool

`dependency-cruiser` (root devDependency) is the enforcement tool. It is standalone of the active linter (`oxlint`), resolves both relative and bare-package (`@pops/*`) imports, and has first-class baseline support via `forbidden` rules plus a known-violations file. A single `.dependency-cruiser.cjs` at the repo root encodes the full rule set above.

Resolution config that the rules depend on:

- `options.tsConfig.fileName` → `tsconfig.base.json`, so workspace `@pops/*` aliases resolve to the right unit.
- `tsPreCompilationDeps: true` so `import type ...` edges are in the graph — type-only imports are cross-unit coupling and are subject to every rule.
- `enhancedResolveOptions.exportsFields: ['exports']` so the resolver honours each package's exports map; an undeclared subpath resolves into `src`/`dist` and trips `no-deep-internal-import`.
- `doNotFollow: ['node_modules', 'dist']` and `exclude: ['node_modules', 'build', '.next', 'coverage', '/migrations/', 'drizzle.config.']` — generated migrations and drizzle config are out of scope; the rule applies to authored source only.

## Scripts

| Script                          | Command                                                                                                   | Purpose                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `pnpm lint:boundaries`          | `depcruise --config .dependency-cruiser.cjs --ignore-known --output-type err pillars libs scripts`        | Fails on any violation not in the baseline     |
| `pnpm lint:boundaries:baseline` | `depcruise --config ... --output-type baseline --output-to .dependency-cruiser-known-violations.json ...` | Regenerates the baseline from the current tree |
| `pnpm isolation:check`          | `pnpm lint:boundaries && pnpm extractability:baseline && pnpm extractability:deps && optional-gates`      | Local one-shot of the full isolation suite     |

The scan globs are `pillars libs scripts` — the three authored-code roots. The `scripts/` tree (root-owned CI guards) is in scope so its own modules stay boundary-clean.

## Baseline Strategy

`.dependency-cruiser-known-violations.json` (dependency-cruiser's standard format, consumed via `--ignore-known`) is the single source of truth for tolerated violations — the grandfathered set that existed when the gate landed during the federation migration. A baselined entry passes; anything new fails.

The baseline is **monotonic: it may only ever shrink.** The `extractability:baseline` guard (`scripts/extractability/baseline-guard.sh`, EX-3) compares the working-tree baseline against `origin/main` and fails if the working tree has more entries. A PR cannot grow the grandfathered set. The path back to zero is to fix a violation, regenerate the baseline, and watch the count drop.

The current baseline holds 82 entries, dominated by:

- `no-circular` — local cycles inside a single unit (e.g. `libs/navigation` search-results components, generated `*-api/client.gen.ts` ↔ runtime-config pairs, `libs/module-registry/scripts`).
- `pillar-no-cross-internal` — a small set of remaining cross-pillar filesystem reaches awaiting refactor.

## CI Integration

`.github/workflows/quality.yml` runs a `boundaries` job (`pnpm lint:boundaries`) on every `pull_request` and on `push: main`. It blocks merge on any new violation; baselined entries pass. Sibling jobs in the same workflow back the isolation suite: `extractability-baseline` (EX-3 monotonicity) and `extractability-deps` (EX-1 declared-deps) run as non-required signal during the federation phase. The workflow ignores docs-only changes (`paths-ignore: docs/**, **/*.md`).

## Edge Cases

| Case                                           | Behaviour                                                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test files (`__tests__`, `*.test.ts`)          | Same boundary rules as production code. Drives extracting cross-unit fixtures into a shared lib.                                                                                                                    |
| Generated migrations / `drizzle.config.ts`     | Out of scope — excluded in `options.exclude`.                                                                                                                                                                       |
| Generated REST clients (`*-api/client.gen.ts`) | In scope; the local cycle each one forms with its runtime-config is baselined, not exempted.                                                                                                                        |
| Type-only imports (`import type ...`)          | Subject to every rule. `tsPreCompilationDeps` keeps the edge in the graph.                                                                                                                                          |
| `registry` pillar                              | A normal pillar (formerly `core`). It has no special "everyone may import me" status; cross-pillar reaches into `pillars/registry/**` are forbidden like any peer. Consume `@pops/registry` + its REST API instead. |
| Lib importing a pillar                         | Forbidden (`lib-no-pillar-import`). A lib takes a pillar capability via injection/discovery at runtime, never a compile-time import.                                                                                |

## Acceptance Criteria

### Tooling

- [x] `dependency-cruiser` is a root devDependency.
- [x] `.dependency-cruiser.cjs` exists at the repo root with TypeScript path resolution wired (`tsConfig: tsconfig.base.json`, exports-map resolution, `tsPreCompilationDeps`).
- [x] `pnpm lint:boundaries` exists as a root script and exits non-zero on any non-baselined rule violation.
- [x] The scan runs against `pillars`, `libs`, and `scripts` roots; generated migrations and `drizzle.config.ts` are excluded.
- [x] Running `pnpm lint:boundaries` on the current tree exits zero (82 known violations ignored, no new ones).

### Rule definitions

- [x] `pillar-no-cross-internal` forbids `pillars/<x>/**` from reaching into `pillars/<y>/**` by filesystem path (x ≠ y) — supersedes the original cross-app rule and extends it to all cross-pillar internals.
- [x] `lib-no-pillar-import` forbids any `libs/**` module from importing a pillar (by path or by `@pops/<pillar>` / `@pops/app-*` specifier).
- [x] `no-deep-internal-import` forbids importing an undeclared `src`/`dist`/`lib`/`internal` subpath of any `@pops/*` package.
- [x] `lib-layering` forbids leaf libs (`types`, `db-types`, `sdk`, `settings`, `ai-telemetry`) from importing any non-leaf `@pops/*` lib.
- [x] `no-circular` forbids any cyclic dependency between modules.
- [x] Retired per-pillar packages are tombstoned (`no-dead-*-pkgs`, `no-dead-shared-schema-pkg`); no new code may import them.
- [x] The shared-lib allow-list for pillar frontends is encoded in the config header comment, not as a separate forbidding rule.
- [x] Type-only imports and test files are subject to the same rules (no exemption).
- [x] Rule names read well in CI failure output (`lib-no-pillar-import`, `pillar-no-cross-internal`, `no-deep-internal-import`, `lib-layering`).

### Baseline and CI

- [x] `.dependency-cruiser-known-violations.json` (dependency-cruiser's standard baseline format) captures every grandfathered violation at land time, consumed via `--ignore-known`.
- [x] `pnpm lint:boundaries:baseline` regenerates the baseline from the current tree (entries are not hand-authored).
- [x] A `boundaries` job in `.github/workflows/quality.yml` runs `pnpm lint:boundaries` and blocks merge on failure, on `pull_request` (not just `push: main`).
- [x] The baseline is monotonic: the `extractability:baseline` guard (EX-3) fails any PR that grows the entry count vs `origin/main`.
- [x] Introducing a new forbidden import makes `pnpm lint:boundaries` fail locally and in CI.

## Out of Scope

- Refactoring code to remove the 82 baselined violations (each tracked by the monotonic-shrink discipline, not by a per-entry ticket).
- Auto-fixing violations.
- Per-runtime contract-vs-DB import discipline (`@pops/<P>-db` consumer rules) — see [consumer-import-discipline](../../../federation/prds/consumer-import-discipline/README.md).
- The GitHub-issue-per-baselined-violation workflow and the original `apps/pops-api`-era rule shape — see [docs/ideas/module-import-boundaries.md](../../../../ideas/module-import-boundaries.md).

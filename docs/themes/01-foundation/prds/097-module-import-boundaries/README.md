# PRD-097: Module Import Boundaries

> Epic: [Modular Module Runtime](../../epics/10-modular-module-runtime.md)
> Status: In progress

## Overview

Enforce ADR-002 / ADR-004 cross-module import boundaries with a lint rule. Apps and api domain modules cannot import from peers (only from `core` and explicitly-allowed shared packages). Honour-system today; lint-enforced after this PRD.

## Boundaries

| Source                             | May import from                                                                                      | May not import from                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `packages/app-<x>/**`              | Workspace shared packages (allow-list below); third-party modules                                    | Any other `packages/app-<y>/**`                         |
| `apps/pops-api/src/modules/<x>/**` | `apps/pops-api/src/modules/core/**`; non-module code under `apps/pops-api/src/`; third-party modules | `apps/pops-api/src/modules/<y>/**` (y ≠ x and y ≠ core) |

Allow-listed shared packages for `packages/app-*`:

- `@pops/ui`
- `@pops/api-client`
- `@pops/navigation`
- `@pops/db-types`
- `@pops/types`
- `@pops/import-tools`

`@pops/auth`, `@pops/test-utils`, `@pops/widgets` are also workspace-shared and follow the same rule (allow-listed if they are in production use; treat unused packages as non-allowed).

## Tool

`dependency-cruiser` is the enforcement tool. Standalone of the active linter (oxlint), supports relative and bare-package imports, has first-class baseline support via `forbidden` rules + a known-violations file. A single `.dependency-cruiser.cjs` at the repo root encodes both rule sets.

`pnpm lint:boundaries` runs `dependency-cruiser` against the relevant globs and exits non-zero on any rule violation that is not in the baseline.

## Baseline Strategy

The baseline file `.dependency-cruiser-known-violations.json` (dependency-cruiser's standard format, consumed via `--ignore-known`) is the single source of truth for tolerated violations. The current baseline is empty: zero cross-module violations are tolerated. New violations introduced by any PR fail CI; the only way to land them is to add an entry to the baseline alongside a tracking issue and a justification.

When a new violation is unavoidable (e.g. an in-flight extraction), the rule is: add it to the baseline in the same PR that introduces it, link the tracking issue in the PR description, close the issue when the violation is removed and the baseline entry deleted. The baseline must never grow without a tracked path back to zero.

## CI Integration

`pnpm lint:boundaries` runs as a job in `.github/workflows/quality.yml`. The job blocks merge on any new violation. Baselined entries pass.

## Edge Cases

| Case                                                | Behaviour                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Test files (`__tests__`, `*.test.ts`)               | Same boundary rules as production code. Drives extracting cross-module test fixtures into shared packages or `core`. |
| Generated code (`drizzle.config.ts`, `migrations/`) | Out of scope; rule applies to `src/` only.                                                                           |
| Type-only imports (`import type ...`)               | Subject to the rule. Cross-module type leakage is structural coupling.                                               |
| `core` → any module                                 | Forbidden in the same way; `core` does not depend on domain modules.                                                 |

## User Stories

| #   | Story                                               | Summary                                                                                        | Parallelisable |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| 01  | [us-01-tooling-setup](us-01-tooling-setup.md)       | Install dependency-cruiser, write `.dependency-cruiser.cjs`, add `pnpm lint:boundaries` script | Yes            |
| 02  | [us-02-rule-definitions](us-02-rule-definitions.md) | Codify cross-app and cross-api-module rules; allow-list shared workspace packages              | Blocked by 01  |
| 03  | [us-03-baseline-and-ci](us-03-baseline-and-ci.md)   | Capture existing violations into baseline, wire job into `quality.yml`, file follow-up issues  | Blocked by 02  |

## Out of Scope

- Refactoring code to remove the baselined violations (each tracked separately).
- Dropping cross-module FK definitions in `packages/db-types`.
- Auto-fixing violations.

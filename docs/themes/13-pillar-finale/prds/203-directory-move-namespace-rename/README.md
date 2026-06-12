# PRD-203: Directory move + tRPC namespace rename

> Epic: [Reclaim misnamed finance code](../../epics/08a-reclaim-misnamed-finance.md)

## Overview

The core mechanical work of Epic 08a: move `commitImport`, `tag-suggester`, `corrections`, and `tag-rules` from their misnamed `core/` locations to their natural finance home in `pops-finance-api`. Rename the tRPC namespaces from `core.*` to `finance.*`. Delete the shim files left behind.

## Data Model

No new tables. Files relocate.

## API Surface

### Directory moves

| Source (today)                                | Destination                                         |
| --------------------------------------------- | --------------------------------------------------- |
| `apps/pops-api/src/modules/core/corrections/` | `apps/pops-finance-api/src/modules/corrections/`    |
| `apps/pops-api/src/modules/core/tag-rules/`   | `apps/pops-finance-api/src/modules/tag-rules/`      |
| `apps/pops-api/src/shared/tag-suggester.ts`   | `apps/pops-finance-api/src/shared/tag-suggester.ts` |
| `apps/pops-api/src/modules/finance/imports/`  | `apps/pops-finance-api/src/modules/imports/`        |

### tRPC namespace renames

| Before               | After                   |
| -------------------- | ----------------------- |
| `core.corrections.*` | `finance.corrections.*` |
| `core.tagRules.*`    | `finance.tagRules.*`    |

## Business Rules

- **All moves happen in one PR.** A piecemeal move would leave the codebase in a broken state mid-flight.
- **Imports update to reference the new module paths.** Every `import { ... } from '../../core/corrections'` → `from '../../corrections'`.
- **tRPC router mounts move from pops-api to pops-finance-api.** The `appRouter` on pops-api drops `core.corrections` + `core.tagRules`; the `appRouter` on pops-finance-api gains `finance.corrections` + `finance.tagRules`.
- **Tests move with their source.** Test files relocate alongside service files.
- **No backwards-compat shim on pops-api.** Breaking; consumers migrate in PRDs 204 + 205.

## Edge Cases

| Case                                                | Behaviour                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| External CLI calls `core.tagRules.list` post-deploy | Returns 404 from nginx (dispatcher rule removed); CLI must be migrated (PRD-205). |
| Test fixture references old import path             | Test file relocates; import paths updated atomically.                             |
| Subscription event payload references old namespace | Update fixture; no runtime impact.                                                |

## User Stories

| #   | Story                                                     | Summary                                                                |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| 01  | [us-01-directory-moves](us-01-directory-moves.md)         | Move all 4 directories; preserve git history with `git mv`             |
| 02  | [us-02-namespace-rename](us-02-namespace-rename.md)       | Update router mounts; namespace prefixes flip from `core` to `finance` |
| 03  | [us-03-import-path-updates](us-03-import-path-updates.md) | grep-and-replace import paths across the codebase                      |
| 04  | [us-04-test-relocation](us-04-test-relocation.md)         | Move test files; verify all pass                                       |

## Out of Scope

- Shell call-site migration (PRD-204).
- MCP + CLI migration (PRD-205).
- Legacy mount deletion on pops-api (PRD-206).
- Behaviour changes — pure code reorganisation.

# Idea: module-import-boundaries — unbuilt / superseded delta

Split out from the [module-import-boundaries](../themes/foundation/prds/module-import-boundaries/README.md) PRD during the greenfield rewrite. The enforced parts of it shipped (see the PRD). What follows is the part of the original spec that was either superseded by the federation isolation model or never built.

## Superseded by the current architecture (do not rebuild)

The original PRD targeted an `apps/pops-api` monolith with per-domain modules under `apps/pops-api/src/modules/<x>/` and frontends in `packages/app-<x>/`. That topology no longer exists — the lake-migration collapsed it into independent `pillars/<id>/` and shared `libs/<name>/`. The following original rule shapes are therefore obsolete:

- **`no-cross-app-import`** (`packages/app-<x>` ↛ `@pops/app-<y>`) → replaced by `pillar-no-cross-internal`, which covers all cross-pillar internals (frontend and backend) and is enforced by filesystem path.
- **`no-cross-api-module-import`** (`apps/pops-api/src/modules/<x>` ↛ `<y>`, with `core` as the one universally-importable module) → there is no shared API container and no `core` module. Each pillar is its own container; `core` became `pillars/registry/`, a normal pillar with no import privilege.
- The original allow-list (`@pops/api-client`, `@pops/import-tools`, `@pops/auth`, `@pops/widgets`, `@pops/test-utils`) — these packages do not exist in the current tree. Pillar frontends import shared libs (`@pops/ui`, `@pops/navigation`, `@pops/types`, `@pops/db-types`) with no per-package allow rule needed.

## Not built — candidate work

### Per-baselined-violation GitHub issues

The original US-03 required every baselined violation to get a tracking issue (`gap(PRD-097): <unit> imports from <peer> — <file>`), referenced from the landing PR's `## Gaps (tracked)` section, closed when the entry is removed.

This was **not** built. The replacement is the monotonic-shrink guard (EX-3, `scripts/extractability/baseline-guard.sh`): the baseline can only shrink, so the set has a guaranteed path to zero without per-entry bookkeeping. That guarantees the _direction_ but loses the _visibility_ — there is no per-violation owner, justification, or target date.

Open question worth a ticket if the baseline stops shrinking: generate a tracking issue (or a checklist doc) per remaining baseline entry — grouped by rule (`no-circular` cycles vs `pillar-no-cross-internal` reaches) — so the remaining 82 entries have named owners instead of relying solely on the shrink guard.

### Baseline-growth justification in-PR

The original spec wanted an unavoidable new violation to be landable by adding a baseline entry plus a linked tracking issue in the same PR. The current model forbids growth outright (EX-3 fails any growth). If a genuinely unavoidable in-flight extraction needs a temporary new entry, there is no sanctioned escape hatch today — the guard would have to be overridden manually. Worth deciding whether to keep the hard "shrink-only" stance or add a reviewed, issue-linked growth exception.

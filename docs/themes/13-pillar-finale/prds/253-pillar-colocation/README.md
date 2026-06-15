# PRD-253: Pillar code colocation (`/pillars/<name>/`)

> Epic: [Pillar isolation](../../epics/) (final-mile · Cleanup #3)
>
> Status: **Not started**

## Overview

Today the codebase is split by **kind** (`/apps/` for runnable services, `/packages/` for libraries) rather than by **pillar**. Touching one pillar means navigating two parallel trees: `apps/pops-core-api/` + `packages/core-db/` + `packages/core-contract/` + `packages/app-core/`. The lego goal calls for the inverse: each pillar's entire code surface lives under a single directory.

This PRD specifies the topology move. Package names (`@pops/*`) stay; only folder paths change, so import statements are not rewritten in this PRD.

## Target Layout

```
pillars/
  core/         { db/, contract/, app/, api/ }
  inventory/    { db/, contract/, app/, api/ }
  media/        { db/, contract/, app/, api/ }
  finance/      { db/, contract/, app/, api/ }
  food/         { db/, contract/, app/, api/ }
  lists/        { db/, contract/, app/, api/ }
  cerebrum/     { db/, contract/, app/, api/ }
  ha-bridge/    { db/, contract/, api/ }
  mcp/          { api/ }
  shell/        { fe/ }
packages/
  pillar-sdk/                # cross-cutting; not pillar-owned
  pillar-sdk-react/
  pillar-sdk-server/
  types/                     # only if anything is left post db-types decomp
```

`pops-api` (legacy monolith) and `packages/db-types/` are NOT in this layout — both must be retired before PRD-253 starts. See [Prerequisites](#prerequisites).

## Surface

| Surface                                                                              | Change                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml`                                                                | `packages: [pillars/*/*, packages/*]`                                                                                                                                     |
| `apps/pops-<pillar>-api/` × 7                                                        | `git mv` to `pillars/<pillar>/api/`                                                                                                                                       |
| `apps/pops-mcp/`                                                                     | `git mv` to `pillars/mcp/api/`                                                                                                                                            |
| `apps/pops-shell/`                                                                   | `git mv` to `pillars/shell/fe/`                                                                                                                                           |
| `packages/<pillar>-db/`, `packages/<pillar>-contract/`, `packages/app-<pillar>/` × 7 | `git mv` to `pillars/<pillar>/{db,contract,app}/`                                                                                                                         |
| `packages/ha-bridge-*/`                                                              | `git mv` to `pillars/ha-bridge/{db,contract,api}/`                                                                                                                        |
| `packages/contracts-<pillar>/`                                                       | merge with `contract/` per pillar (or rename one of the two if both exist)                                                                                                |
| `scripts/generate-pillar-dockerfile.mjs`                                             | walks `pnpm m ls --filter "<pillar>-api..." --json` — output paths now `pillars/<pillar>/...` instead of `apps/pops-<pillar>-api/...` and `packages/*/`. Logic unchanged. |
| `apps/pops-*-api/Dockerfile` (7)                                                     | Regenerated from updated script; live under `pillars/<pillar>/api/Dockerfile`                                                                                             |
| `.github/workflows/*.yml` `paths:` filters                                           | `apps/pops-<pillar>-api/**` → `pillars/<pillar>/**` (per pillar)                                                                                                          |
| `.dependency-cruiser-known-violations.json` paths                                    | Mass rewrite of allow-list paths                                                                                                                                          |
| `.dependency-cruiser.cjs` boundary rules                                             | Update path patterns to recognise `pillars/<pillar>/` ownership                                                                                                           |
| `homelab-infra/hosts/capivara/stacks/pops/docker-compose.yml` `build.context`        | Per-pillar build context paths update (separate PR in `homelab-infra`)                                                                                                    |
| Root docs (`AGENTS.md`, `CLAUDE.md`, `docs/README.md`)                               | Any reference to `apps/pops-*-api/` or `packages/<pillar>-*/` rewritten                                                                                                   |
| `pnpm-lock.yaml`                                                                     | Regenerated by `pnpm install --lockfile-only`                                                                                                                             |

## Business Rules

- **Package names stay.** `@pops/core-db` does not become `@pops/core/db`. Imports across the codebase are not touched in this PRD. A future rename PR (purely mechanical, find-replace) can do that if desired.
- **One mega-PR.** Pillar-incremental moves would leave the workspace in a confusing half-state for days. The move is `git mv` only — no behaviour change — so the diff is large but reviewable as "did each path move 1:1".
- **No package merges in this PR.** If a pillar has both `<pillar>-contract` and `contracts-<pillar>` (per existing inconsistency), the move keeps them as separate dirs; rename/merge is a follow-up.
- **CI smoke first.** Before merge, the PR must trigger every per-pillar workflow at least once to prove the new `paths:` filters match. A trivial whitespace touch per pillar directory at the start of the diff achieves this.
- **Worktree cleanup.** No active git worktrees may target the renamed paths at merge time. The merge agent verifies and stops if any are alive.
- **Watchtower unaffected.** Container deploy follows image tags; the move does not change image names or registry paths.

## Prerequisites (blocking)

| Prerequisite                                                                                                                                | Status                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/db-types/` deletable (PRD-245 US-08 / #3283)                                                                                      | ✅ merged this session                                                                               |
| `apps/pops-api/` (legacy monolith) retired — all cross-pillar SDK PRDs closed, all media + cerebrum + core consumers flipped to typed proxy | ⏳ PRD-247 US-03 plex slice in flight; PRD-248 US-05/06 stalled (3 attempts); other cleanup in queue |
| `packages/contracts-<pillar>` vs `packages/<pillar>-contract` naming reconciled (or scoped to leave duplicates)                             | Not started — out of scope for PRD-253 if duplicates are tolerated as-is                             |

If the monolith retirement stalls, PRD-253 can still ship with `pops-api` left at `apps/pops-api/` (untouched), as a documented exception, with a follow-up PRD to retire it. Less clean but unblocks the colocation.

## Edge Cases

| Case                                                                                    | Behaviour                                                                                                          |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| pnpm-workspace glob doesn't match a moved package                                       | `pnpm install` fails fast; smoke detects it pre-merge                                                              |
| Workflow `paths:` filter mistyped → CI not triggered for a pillar                       | Smoke commits (one per pillar) prove each workflow fires                                                           |
| `dependency-cruiser` H8 allow-list path mismatch → false-positive violations on next PR | Allow-list paths rewritten in same PR; verification: `pnpm lint:boundaries` reports 0 new violations               |
| Watchtower can't find image                                                             | No — Docker image names live in registry, not path-derived                                                         |
| Test fixtures hard-code `apps/...` paths                                                | Grep for `apps/` and `packages/` literal strings; rewrite or `replaceAll`                                          |
| IDE `.vscode/settings.json` or `.zed/*.json` hard-codes paths                           | Update or delete; not a CI gate                                                                                    |
| External tooling (Renovate, GitHub Action paths in URLs)                                | Renovate auto-discovers via workspace; GitHub Actions only triggered by `on.push.paths` (handled above)            |
| Active git worktrees at merge time                                                      | Detection step: `git worktree list` must show no agent-\* paths touching moved dirs; merge blocks if any are alive |
| Mid-PR `main` lands a change in `apps/pops-<pillar>-api/`                               | Rebase; conflict is mechanical (path rewrite on the inbound file)                                                  |

## Acceptance Criteria

PRD-253 is a **single-deliverable PRD** (no US split, per [docs/CLAUDE.md](../../../CLAUDE.md)). Acceptance:

- [ ] `pnpm-workspace.yaml` lists `pillars/*/*` and `packages/*`
- [ ] Every pillar API service has its Dockerfile + source under `pillars/<name>/api/`
- [ ] Every pillar DB / contract / app package has its source under `pillars/<name>/{db,contract,app}/`
- [ ] `pops-mcp` lives at `pillars/mcp/api/`
- [ ] `pops-shell` lives at `pillars/shell/fe/`
- [ ] `apps/` directory is empty (or contains only documented exceptions per [Prerequisites](#prerequisites))
- [ ] `pnpm install` clean, no workspace glob warnings
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm lint:boundaries` all green
- [ ] `pnpm build` clean across every pillar
- [ ] `scripts/generate-pillar-dockerfile.mjs` produces no-drift output for every pillar (drift-check on PR is green)
- [ ] `docker buildx build` succeeds for every `pillars/<pillar>/api/Dockerfile` locally (or in CI Docker Build workflow)
- [ ] Husky pre-commit + pre-push pass without `--no-verify`
- [ ] Every per-pillar `*-image.yml` workflow triggered at least once during the PR (CI run visible in checks)
- [ ] `homelab-infra` companion PR opened with matching `build.context` updates
- [ ] `IMPLEMENTATION-PLAN.md`, `AGENTS.md`, `docs/README.md` references updated

## Out of Scope

- Package name renames (`@pops/core-db` → `@pops/core/db`) — future PR if wanted
- Merging `contracts-<pillar>` and `<pillar>-contract` duplicates
- `pops-api` retirement (separate PRD; PRD-253 assumes it's already gone or documents the exception)
- `packages/db-types/` deletion (already shipped via PRD-245 US-08)
- IDE config rewrites beyond `.vscode/settings.json` paths
- TS path alias rewrites in `tsconfig*.json` (not needed — paths resolve through pnpm workspace, not literal paths)

## References

- Task #534 (parked PR #3208) — original "Cleanup #3 code topology reorg" scoping note
- [PRD-245](../245-db-types-decomposition/README.md) — db-types decomposition (US-08 deleted the dir)
- [PRD-246](../246-shell-api-pillar-decoupling/README.md) — shell + api pillar decoupling
- [PRD-252](../252-per-pillar-dockerfile-isolation-hd1/README.md) — per-pillar Dockerfiles (whose generator this PRD updates)
- [ADR-026 — Pillar architecture](../../../../architecture/adr-026-pillar-architecture.md)
- [ADR-035 — Pillar redefinition + implicit kinds](../../../../architecture/adr-035-pillar-redefinition.md)

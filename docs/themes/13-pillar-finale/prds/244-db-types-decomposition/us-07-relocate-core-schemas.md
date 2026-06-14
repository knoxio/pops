# US-07: Relocate core schemas into `@pops/core-db`

> PRD: [PRD-244 — `@pops/db-types` decomposition](README.md)

## Description

As a maintainer dismantling `@pops/db-types/schema/`, I want the core-owned tables to live in `@pops/core-db`. Core is the link target for most cross-pillar FK drops in this PRD, so it lands first to give the downstream relocations a stable target. No cross-pillar FKs to drop (intra-core only).

## Acceptance Criteria

- [ ] The following files move from `packages/db-types/src/schema/` to `packages/core-db/src/schema/`, alongside their matching `*-row-schemas.ts`:
      `entities.ts`, `environments.ts`, `pillar-registry.ts`, `service-accounts.ts`, `settings.ts`, `user-settings.ts`, `corrections.ts` (per audit attribution `core → core`), `ai-alert-rules.ts`, `ai-alerts.ts`, `ai-budgets.ts`, `ai-inference-daily.ts`, `ai-inference-log.ts`, `ai-model-pricing.ts`, `ai-providers.ts`, `ai-usage.ts`, plus the contents of the existing `core/` subdirectory (`core/embeddings.ts` moves with cerebrum US-01 per audit attribution — verify).
- [ ] All intra-core FKs are preserved (e.g. `corrections.ts:16` → `entities.id`).
- [ ] `packages/core-db/src/schema.ts` exports each relocated table from the new local path. The existing `from '@pops/db-types'` re-export for these tables is removed.
- [ ] `packages/db-types/src/schema/index.ts` re-exports each relocated table from `@pops/core-db` (transition shim) so existing import sites keep compiling until US-08.
- [ ] Smoke-import test in `core-db` asserts each relocated table resolves with the expected drizzle `name`.
- [ ] Consumers under `apps/pops-api/src/modules/core/` that import these tables from `@pops/db-types` are repointed at `@pops/core-db`.
- [ ] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [ ] `pnpm --filter @pops/core-db typecheck/test/build`, `pnpm --filter @pops/db-types typecheck/test/build`, and `pnpm --filter @pops/api typecheck/test` all pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This is the FK-target settling step for US-02 (inventory → core), US-03 (finance → core), and indirectly US-01 (which only drops references into media but benefits from `core/embeddings.ts` having a final home).
- `ai-*` tables park under core per audit attribution (ai is a sub-domain of core today, same reasoning as PRD-239's `aiConfigManifest` placement under `@pops/core-contract`). A future `@pops/ai-db` split is out of scope.
- Serial-merge order per PRD-244: **first** in the sequence.

# Finance API Pillar Verification Runbook

Verification drill for the **finance pillar** container after the ADR-026 Phase 3 migration. Run this before flipping Track E to ✅ Done.

## What finance-api owns today

After finance pillar Phase 3:

- `apps/pops-finance-api/` ships as `ghcr.io/knoxio/pops-finance-api`, listens on port 3004 inside the container network (3001=core, 3002=inventory, 3003=media, 3004=finance).
- Endpoints exposed: `GET /health`.
- `finance.db` (separate SQLite file from `pops.db`, `core.db`, `inventory.db`, and `media.db`) is the canonical store for every finance-owned table: `entities`, `transactions`, `transaction_corrections`, `transaction_tag_rules`, `tag_vocabulary`, `budgets`, and `wish_list`. The Track N boot-time backfill (`backfillFinanceFromShared`) copies any pre-cutover rows that still live in `pops.db` across to `finance.db` on next prod boot, so the file is non-empty even on the first run after the per-pillar cutovers (N1, N3, N4, N5) land. Phase 2 PR 3 cut pops-api over to `getFinanceDrizzle()` for wish-list reads/writes; subsequent N-track PRs do the same for the rest.
- The shell talks to finance **indirectly** via pops-api's tRPC routers (which now route wish-list through `finance.db`). The shell never opens a direct browser-to-finance-api connection; cross-pillar HTTP fan-out runs on the `/pillars/health` aggregator already proxied to pops-api.
- `pops-api`, `pops-worker`, and `pops-shell` (via nginx → core-api) all read pillar registry data that includes the finance entry, because `POPS_PILLARS` in docker-compose lists `finance:http://finance-api:3004`.

## Drill: simulate a finance-api outage

The Phase 4 verification per the roadmap: stop the finance container and confirm the rest of the stack behaves as documented.

### Step 1 — capture the healthy baseline

`finance-api` is exposed inside the compose network (`expose: 3004`),
not bound to a host port. Run the probes from inside the network —
either via `docker compose exec` on a sibling service or with an
ad-hoc curl container:

```sh
docker compose -f infra/docker-compose.yml ps
# core-api, inventory-api, media-api, finance-api, pops-api, pops-shell,
# pops-worker should all be "running (healthy)".

# Probe from inside the compose network.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://finance-api:3004/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"ok":true,"pillar":"finance","version":"<git-sha>"}

# The shell's /pillars proxy is wired to core-api, which surfaces
# finance in its registry response too via POPS_PILLARS:
curl -sS http://localhost:80/pillars
# {"pillars":[{"id":"core","baseUrl":"http://core-api:3001"},{"id":"inventory","baseUrl":"http://inventory-api:3002"},{"id":"media","baseUrl":"http://media-api:3003"},{"id":"finance","baseUrl":"http://finance-api:3004"}]}
```

### Step 2 — stop finance-api and observe

```sh
docker compose -f infra/docker-compose.yml stop finance-api
```

Expected behaviour:

- `pops-api` was started behind `depends_on: finance-api (service_healthy)` — it keeps running, but **every wish-list tRPC call** writes to `finance.db` on a shared volume; the container being stopped does NOT close the volume mount or the SQLite file, so reads/writes continue to land on `finance.db` directly. The stop drill is therefore a soft test of compose ordering, not a real outage of the data layer. **To truly simulate an outage**, also unmount or move `finance.db` aside.
- `pops-shell` boot probe to `/pillars` still succeeds (because the proxy hits core-api, not finance-api). The finance entry stays in the registry; the `/pillars/health` aggregator (still on pops-api) flips finance's status from `'healthy'` to `'unavailable'` after the per-probe timeout fires. `PillarGuard` reads `'unavailable'` and shows the unavailable placeholder on the wish-list route; other routes (food, media, inventory, lists, cerebrum, and the rest of finance that hasn't migrated) keep working.
- The soft fallback is intentional — losing the finance pillar should NOT take down the whole shell. The shell shows degraded UI on the wish-list route and full UI everywhere else.

### Step 3 — restart finance-api and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start finance-api
```

Within ~30s the healthcheck reports healthy. Re-running the curl probes in Step 1 returns the same shapes. `PillarGuard` re-promotes finance from `'unavailable'` back to `'healthy'` on the next status-context refresh; the wish-list UI hydrates without a hard navigation.

### Step 4 — write up surprises

Record any unexpected behaviour in the **Lessons captured** section of
`.claude/pillar-migration-roadmap.md` before flipping Track E to ✅
Done. That file is gitignored — it only exists in local clones /
sibling workspaces, so it isn't linkable from GitHub. Examples worth
flagging:

- pops-api hard-crashes when finance-api is down (it shouldn't — should degrade per-route).
- The shell's "finance unavailable" placeholder paints over working non-finance routes (PillarGuard scoping is too broad).
- `finance.db` writes succeed against a stopped finance-api container (proves the shared-volume caveat noted in Step 2 — phase 4 follow-up: convert finance-api to the sole writer once tRPC routers move into it).

## Track N3 phase 1 PR 4 — in-tree `transaction_corrections` service deletion deferred

Track N3 phase 1 PR 4 was scoped to delete the in-tree `transaction_corrections`
service files from `apps/pops-api/src/modules/core/corrections/` now that PR 3
(#2899) flipped the user-facing CRUD + matcher surface (`handlers/query-helpers.ts`,
`handlers/pattern-match.ts`, `router-crud.ts`) onto `@pops/finance-db`'s
`transactionCorrectionsService`. The deletion is **unsafe today**. This section
captures the audit and unblock conditions; the PR ships no source/test churn.

### Audit — what still consumes the in-tree service files

PR 3's scoping note (#2899 body, "Intentionally not flipped") deliberately left
the imports pipeline on the in-tree implementation. A fresh sweep of
`apps/pops-api/src/` confirms the consumer set is even broader than the imports
pipeline:

| In-tree file                                   | Consumed by (outside `core/corrections/`)                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service.ts` (barrel re-exporter)              | `shared/tag-suggester.ts` (`findAllMatchingCorrections`), `finance/imports/router.ts` (`applyChangeSet`), `finance/imports/lib/transaction-persistence.ts` (`applyChangeSet`), `finance/imports/lib/reclassify-existing.ts` (`findMatchingCorrectionFromRules`), `finance/imports/lib/correction-application.ts` (`listCorrections`), `finance/imports/lib/apply-learned-correction.ts` (`findAllMatchingCorrectionFromDB`), `finance/imports/service.rule-provenance.test.ts` (test fixture wiring). |
| `pure-service.ts` / `apply-changeset-rules.ts` | `finance/imports/lib/correction-application.ts` (`applyChangeSetToRules`), `finance/imports/lib/apply-learned-correction.ts` (`findAllMatchingCorrectionFromRules`).                                                                                                                                                                                                                                                                                                                                  |
| `types.ts` / `types-base.ts`                   | `shared/tag-suggester.ts` (`normalizeDescription`), `finance/imports/types.ts` (`ChangeSetSchema`), `finance/imports/router.ts` (`ChangeSetSchema`), `finance/imports/router.test.ts` (`ChangeSet`), `finance/imports/lib/reclassify-existing.ts` (`CorrectionRow`), `finance/imports/lib/correction-application.ts` (`ChangeSet`, `CorrectionRow`), `finance/imports/lib/apply-learned-correction.ts` (`CorrectionRow`, `classifyCorrectionMatch`).                                                  |
| `handlers/apply-corrections.ts`                | Re-exported via `service.ts` as `applyChangeSet`; reads/writes the `transactionCorrections` table directly via `getDrizzle()`.                                                                                                                                                                                                                                                                                                                                                                        |
| `handlers/compute-changeset.ts`                | Re-exported via `service.ts` as `proposeChangeSetFromCorrectionSignal`; reads the table directly.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `handlers/changeset-impact.ts`                 | Used by the in-tree `router-changeset.ts`; reads the table directly.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `handlers/ai-revise.ts` / `ai-inference.ts`    | Re-exported via `service.ts` and used by `router-changeset.ts`; reads the table directly.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `handlers/preview-matches.ts`                  | Re-exported via `service.ts`; used by `router.ts` for the preview procedure.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `handlers/query-helpers.ts` (the PR 3 shim)    | Re-exported via `service.ts`; consumed by `tag-suggester.ts`, the imports pipeline, and `router-crud.ts`.                                                                                                                                                                                                                                                                                                                                                                                             |
| `handlers/pattern-match.ts` (the PR 3 shim)    | Re-exported via `service.ts`; consumed by `tag-suggester.ts`, the imports pipeline, `lib/rule-generator.ts`, and `lib/analyze-correction.ts`.                                                                                                                                                                                                                                                                                                                                                         |

Even the PR 3 shim files cannot be deleted in isolation. `service.ts` is the
barrel everyone outside `core/corrections/` imports from, and it re-exports
`{listCorrections, findAllMatchingCorrections, applyChangeSet, ...}` from the
shim and non-shim handlers alike. Removing either shim file breaks `tag-suggester.ts`
and the imports pipeline at compile time.

### Trade-off

PR 3 (#2899) was deliberately scoped as a routing flip, not a removal. Its body
states the deletion was contingent on **(a)** the imports pipeline (Track N6)
moving onto `@pops/finance-db`, and **(b)** the higher-level changeset / AI
orchestrations (`apply-corrections`, `compute-changeset`, `changeset-impact`,
`ai-revise`, `ai-inference`, `preview-matches`) also moving off in-tree drizzle
access. Neither has happened.

Deleting the service files today would break:

- `shared/tag-suggester.ts` — used by the imports pipeline and `apps/pops-mcp`'s
  finance tooling. No replacement path exists in `@pops/finance-db`.
- `finance/imports/router.ts` — the `applyChangeSetAndReevaluate` mutation calls
  `applyChangeSet` (in-tree changeset writer that the package does not yet expose).
- The in-tree `core.corrections.changeset.*` tRPC routes — `router-changeset.ts`
  depends on `apply-corrections`, `compute-changeset`, `changeset-impact`,
  `ai-revise`, `ai-inference`.

### Unblock conditions

The deletion can ship once all of the following land:

1. **Track N6 cutover** of `imports/lib/{correction-application, correction-helpers, apply-learned-correction, reclassify-existing, transaction-persistence}.ts`, `imports/router.ts`, and `imports/types.ts` onto `@pops/finance-db`. This is N6's announced scope.
2. **Package exposure** of `applyChangeSet`, `proposeChangeSetFromCorrectionSignal`, `previewMatches`, and the AI revise / inference orchestrations on `@pops/finance-db` so `router-changeset.ts` and the imports router can swap their imports without losing functionality.
3. **`shared/tag-suggester.ts`** migrated to read from the package (`transactionCorrectionsService.findAllMatchingTransactionCorrections` already exists; the helper just needs the call-site swap).
4. **The handle swap** from `getDrizzle()` to `getFinanceDrizzle()` — PR 3 explicitly deferred this because the on-disk `transaction_corrections` rows still live in `pops.db`. PR 3's note: _"PR 4 (the imports cutover) will land the backfill + handle swap together."_ That backfill is N6 territory, not N3.

### Lesson captured

When a phase-1 cutover is scoped to a routing flip with a barrel re-exporter
(`service.ts`) still re-exporting non-flipped handlers, the deletion PR cannot
ship until every consumer of the barrel has been moved. Track J3 PR 4 (#2870)
and Track K3 PR 4 (#2881) cleared their barrels in the same PR as the consumer cutover —
the canonical pattern — and so were free to delete in PR 4. Track N3's scaffold
(#2857) deliberately left the imports pipeline behind for N6, which fragments
the deletion. Future tracks of this shape should plan PR 4 as a follow-on to the
N6-equivalent cutover, not as a phase-1 deliverable. M4 PR 3 (#2900) and M5 PR 3
(#2901) hit the same pattern at the nginx-dispatcher layer.

## Track N4 phase 1 PR 4 — in-tree `transaction_tag_rules` shim deletion deferred

Track N4 phase 1 PR 4 was scoped to delete the in-tree `transaction_tag_rules`
shim under `apps/pops-api/src/modules/core/tag-rules/` now that PR 3 (#2908)
flipped the CRUD surface (`service.ts`, `router.ts`) onto `@pops/finance-db`'s
`transactionTagRulesService` and #2915 created the underlying table in
`finance.db`. The deletion is **unsafe today**. This section captures the
audit and unblock conditions; the PR ships no source/test churn.

### Audit — what still consumes the in-tree shim

PR 3's body (#2908, "What stays for PR 4") explicitly noted that the imports
persistence pipeline still imports `applyTagRuleChangeSet` / `upsertVocabularyTag`
from `core/tag-rules/service.ts` and would need to migrate first under Track N6.
A fresh sweep of `apps/pops-api/src/` and `packages/` confirms the consumer set
is broader than the imports pipeline alone — `app-finance` UI code consumes the
`TagRuleChangeSet*` types through the cross-package `@pops/api/modules/core/tag-rules/types`
path:

| In-tree file    | Consumed by (outside `core/tag-rules/`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service.ts`    | `finance/imports/lib/transaction-persistence.ts` (`applyTagRuleChangeSet`, `upsertVocabularyTag`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `types.ts`      | `finance/imports/lib/commit-temp-resolver.ts` (`TagRuleChangeSet`), `finance/imports/types.ts` (`TagRuleChangeSetSchema`), `packages/app-finance/src/components/imports/rule-creation/utils.ts`, `packages/app-finance/src/components/imports/tag-review/useTagReviewActions.ts`, `packages/app-finance/src/components/imports/tag-review/useTagReviewState.ts`, `packages/app-finance/src/components/imports/TagReviewStep.test.tsx`, `packages/app-finance/src/lib/commit-payload.ts`, `packages/app-finance/src/lib/commit-payload.test.ts`, `packages/app-finance/src/store/import-store-types.ts`. |
| `router.ts`     | `apps/pops-api/src/modules/core/index.ts` mounts `tagRulesRouter` on the tRPC tree. Stays in place per the Option A scoping decision in #2908 — the router lives under `modules/core/tag-rules/` and cross-pillar imports `@pops/finance-db`.                                                                                                                                                                                                                                                                                                                                                           |
| `preview.ts`    | Re-exported via `service.ts`; suggestion-only logic with no persistence. Out of scope for the cutover.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `vocabulary.ts` | Re-exported via `service.ts`; reads/writes `tag_vocabulary`. Waits on Track N5 PR 3, not N4 PR 4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Even though PR 3 flipped the `service.ts` CRUD paths onto the package, the file
still acts as the barrel that every non-`core/tag-rules/` caller imports from.
Deleting `service.ts` breaks `transaction-persistence.ts` at compile time.
Deleting `types.ts` breaks the entire `app-finance` import-flow UI plus the
in-tree `finance/imports/types.ts` (`TagRuleChangeSetSchema`) and
`commit-temp-resolver.ts`.

### Trade-off

PR 3 (#2908) was deliberately scoped as a routing flip, not a removal. Its body
states the deletion was contingent on **(a)** the imports pipeline (Track N6)
moving onto `@pops/finance-db`, and **(b)** the `app-finance` UI consumers
swapping their `@pops/api/modules/core/tag-rules/types` imports onto a
package-owned type surface. Neither has happened.

Deleting the shim today would break:

- `finance/imports/lib/transaction-persistence.ts` — the commit pipeline calls
  `applyTagRuleChangeSet` and `upsertVocabularyTag` directly. `@pops/finance-db`
  exposes `transactionTagRulesService.*` and `upsertVocabularyTag`, but the
  call sites still go through the in-tree barrel.
- `finance/imports/types.ts` — re-exports / wraps `TagRuleChangeSetSchema`
  inside the commit payload schema for the imports router.
- `finance/imports/lib/commit-temp-resolver.ts` — typed against
  `TagRuleChangeSet`; consumed by `transaction-persistence.ts`.
- The entire `packages/app-finance` import-flow surface — `commit-payload.ts`,
  `import-store-types.ts`, `TagReviewStep.test.tsx`, and the `tag-review` +
  `rule-creation` hooks all import `TagRuleChangeSet` / `TagRuleImpactItem`
  through `@pops/api/modules/core/tag-rules/types`.

### Unblock conditions

The deletion can ship once all of the following land:

1. **Track N6 cutover** of `finance/imports/lib/transaction-persistence.ts`,
   `finance/imports/lib/commit-temp-resolver.ts`, and `finance/imports/types.ts`
   onto `@pops/finance-db` — call `transactionTagRulesService.*` and
   `upsertVocabularyTag` directly, and source `TagRuleChangeSet*` from a
   package-owned types module.
2. **Package exposure of the `TagRuleChangeSet*` schema + types** on
   `@pops/finance-db` (or a sibling tag-rules contract package) so
   `packages/app-finance` can import `TagRuleChangeSet`, `TagRuleImpactItem`,
   and `TagRuleChangeSetSchema` without crossing the `@pops/api/modules/...`
   boundary. The Zod schema currently lives only in-tree.
3. **`packages/app-finance` import swap** — `commit-payload.ts`,
   `import-store-types.ts`, `TagReviewStep.test.tsx`, `tag-review/useTagReviewActions.ts`,
   `tag-review/useTagReviewState.ts`, `rule-creation/utils.ts`, and
   `commit-payload.test.ts` repoint to the package-owned types module.
4. **`proposeTagRuleChangeSet`** moved onto the package (or its remaining
   in-tree caller deleted) so deleting `service.ts` doesn't strand the
   tag-edit-signal proposal helper. Today it is exported from the shim but is
   not yet on `@pops/finance-db`.

### Lesson captured

Same shape as Track N3 PR 4 (#2905): a phase-1 cutover scoped to a CRUD flip
leaves a barrel re-exporter (`service.ts`) re-exporting non-flipped helpers
(`previewTagRuleChangeSet`, `proposeTagRuleChangeSet`, `upsertVocabularyTag`)
plus a co-located Zod schema (`types.ts`) that the entire UI package depends on
through `@pops/api/modules/...`. The deletion PR cannot ship until every
consumer of the barrel and every cross-package types import has been moved.
Track J Phase 1 PR 4 (#2870) and Track K Phase 1 PR 4 (#2881) cleared their
barrels in the same PR as the consumer cutover — the canonical pattern — and
so were free to delete in PR 4. Track N4's scaffold (#2856) and cutover (#2908) deliberately
left the imports pipeline + the cross-package types path behind for N6,
fragmenting the deletion. Future tracks of this shape should plan PR 4 as a
follow-on to the N6-equivalent cutover, not as a phase-1 deliverable, and
should land a package-owned Zod schema module in PR 1 so UI consumers never
take a dependency on `@pops/api/modules/...`. Track N3 PR 4 (#2905), M4 PR 3
(#2900), and M5 PR 3 (#2901) all hit the same pattern.

## Track N6 phase 1 PR 4 — imports persistence shim deletion deferred

Track N6 phase 1 PR 4 was scoped to delete the persistence shims that PR 3
(#2902) introduced under `apps/pops-api/src/modules/finance/imports/`, now that
the user-facing imports pipeline (`processImport`, `executeImport`,
`commitImport`, the entity-creation mutation, and the AI categoriser's
deduplication / entity-lookup reads) forwards into `@pops/finance-db`'s
`importsService`. The deletion is **unsafe today as a file-level delete**. This
section captures the audit and unblock conditions; the PR ships no source/test
churn.

### Audit — what the shims look like and what still consumes them

PR 3 (#2902) intentionally kept the slice's transformer pipeline + orchestration
code in pops-api and forwarded only the four persistence primitives plus the
`createEntity` mutation onto the package. The resulting shim surface is split
across two pure-shim files and two mixed files:

| In-tree file                     | Shim symbols                                              | Coexisting orchestration code                                                                                                                                                                                     | Internal consumers                                                                                                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/deduplication.ts`           | `findExistingChecksums`                                   | None — pure shim.                                                                                                                                                                                                 | `imports/process-service.ts` (`findExistingChecksums`).                                                                                                                                                                                                                                                |
| `lib/entity-lookup.ts`           | `loadEntityMaps`, `EntityEntry` / `EntityMaps` re-exports | `buildEntityMaps` — pure in-memory helper used only by `entity-lookup.test.ts`.                                                                                                                                   | `imports/process-service.ts` (`loadEntityMaps`), `imports/lib/correction-application.ts` (`loadEntityMaps` + the `entityLookup` / `aliases` types), `imports/lib/entity-matcher.ts` (`EntityEntry` type), `imports/lib/process-transaction-helpers.ts` (`EntityEntry` type), `entity-matcher.test.ts`. |
| `lib/transaction-persistence.ts` | `insertTransaction`, `createEntityInternal`               | `commitImport` (atomic SQLite transaction), `createEntitiesPhase`, `applyChangeSetsPhase`, `applyTagRuleChangeSetsPhase`, `writeTransactionsPhase`, `deriveTransactionType`.                                      | `imports/execute-service.ts` (`insertTransaction`), the file's own `writeTransactionsPhase` (`insertTransaction`) and `createEntitiesPhase` (`createEntityInternal`).                                                                                                                                  |
| `service.ts`                     | `createEntity`                                            | `processImport`, `executeImport`, `processImportWithProgress`, `executeImportWithProgress`, `logBackgroundImportComplete`, `reportBackgroundFailure`, and the `commitImport` / correction-application re-exports. | `imports/router.ts` mounts `createEntity` as the `imports.createEntity` tRPC mutation. The remaining orchestration exports are consumed by the same router and by `imports/router.test.ts`.                                                                                                            |

Two files are pure shims (`lib/deduplication.ts`, `lib/entity-lookup.ts` —
modulo the test-only `buildEntityMaps` helper) and could in principle be deleted
once their call sites swap to `importsService.*` directly. The other two
(`lib/transaction-persistence.ts`, `service.ts`) interleave shim helpers with
orchestration code that must stay in pops-api: the commit-time SQLite
transaction wrap, the entity / changeSet / tag-rule / write phases, the
progress-streaming background tasks, and the formatted error path. A
file-level delete of either would strand the orchestration.

### Trade-off

PR 3 (#2902) Option A landed an atomic transaction wrap around `commitImport`
on `finance.db`, closing the correctness gap raised in #2842. The deferred
deletion is therefore a **code-organisation cleanup**, not a correctness
concern. The runtime behaviour and the on-disk transaction boundary are
identical whether the shim helpers stay in the slice or get inlined at every
call site.

Deleting the shim helpers today as a file-level delete would break:

- `imports/process-service.ts` — calls `findExistingChecksums` and
  `loadEntityMaps` through the shim files.
- `imports/lib/correction-application.ts`, `entity-matcher.ts`, and
  `process-transaction-helpers.ts` — typed against `EntityEntry` / `EntityMaps`
  re-exports from `lib/entity-lookup.ts`.
- `imports/execute-service.ts` and the in-file phase orchestrators in
  `lib/transaction-persistence.ts` — call `insertTransaction` and
  `createEntityInternal` from inside the same module.
- `imports/router.ts` — mounts `createEntity` as the
  `finance.imports.createEntity` tRPC mutation off the slice's `service.ts`.

### Unblock conditions

The deletion (or full inlining, depending on which path the cleanup PR picks)
can ship once all of the following land:

1. **Retarget every internal call site** off the shim helpers and onto
   `importsService.*` directly. Concretely:
   - `process-service.ts` swaps `findExistingChecksums` / `loadEntityMaps` for
     `importsService.findExistingChecksums(getFinanceDrizzle(), …)` /
     `importsService.loadEntityMaps(getFinanceDrizzle())`.
   - `correction-application.ts` swaps `loadEntityMaps` likewise and sources
     `EntityMaps` / `EntityLookupEntry` from `@pops/finance-db`.
   - `entity-matcher.ts` and `process-transaction-helpers.ts` source
     `EntityEntry` from `@pops/finance-db` (alias the package's
     `EntityLookupEntry` at the type-import boundary if the local name is worth
     keeping).
   - `execute-service.ts` swaps `insertTransaction` for
     `importsService.insertImportTransaction(getFinanceDrizzle(), …)`.
   - `writeTransactionsPhase` / `createEntitiesPhase` inside
     `transaction-persistence.ts` swap their `insertTransaction` /
     `createEntityInternal` callers for the package calls directly.
   - `imports/router.ts` swaps `createEntity` for
     `importsService.createImportEntity(getFinanceDrizzle(), input.name)`.
2. **Extract orchestration out of the mixed files** if the cleanup PR prefers a
   file-level delete over inlining. `lib/transaction-persistence.ts` would split
   into `lib/commit-import.ts` (the `commitImport` orchestrator + its phase
   helpers) and a deleted shim file; `service.ts` would lose its `createEntity`
   export but keep `processImport` / `executeImport` / `*WithProgress` /
   `commitImport` re-export. Pure inlining (no split, no file delete) is the
   smaller change and likely the right one — the shim files become the natural
   delete targets once their last call sites are gone.
3. **Resolve #2921** — the residual cross-DB calls inside `applyChangeSet` /
   `applyTagRuleChangeSet` (still reaching into `pops.db` from within the
   `finance.db` transaction wrap) are a separate concern from the shim
   deletion, but the cleanup PR should land after #2921 so the inlined
   call sites don't get rewritten twice.
4. **`buildEntityMaps`** — the test-only in-memory helper currently colocated
   with the `loadEntityMaps` shim moves to a sibling `lib/entity-maps.ts`
   (or onto `@pops/finance-db` if other consumers appear) so deleting
   `lib/entity-lookup.ts` doesn't strand it.

### Lesson captured

Same shape as Track N3 PR 4 (#2905) and Track N4 PR 4 — a phase-1 cutover that
forwards persistence primitives through thin in-tree shims while leaving the
orchestration code in place fragments the deletion across two files (the pure
shim files vs. the mixed orchestration files). The canonical clean-delete path
(Track N1 PR 4 #2907, Track J PR 4 #2870, Track K PR 4 #2881) only works when
PR 3 leaves the shim file with zero remaining call sites — i.e. the cutover
flips every consumer of the shim before PR 4 lands. Track N6's scope
deliberately kept the slice's transformer pipeline + orchestration on the
shims to keep the PR 3 diff reviewable, so PR 4 inherits a retargeting workload
rather than a file-level delete. The atomic-wrap correctness fix from Option A
(#2902) means there is no time pressure on the cleanup — defer until the
retargeting PR can be scheduled.

## Reference

- ADR-026: per-domain pillar architecture
- `apps/pops-finance-api/src/server.ts` — boot sequence
- `apps/pops-shell/src/app/pillars/pillar-registry-client.ts` — soft-fallback behaviour (shared with core)
- `docs/runbooks/core-api-pillar-verification.md` — sibling runbook for the core pillar
- `docs/runbooks/inventory-api-pillar-verification.md` — sibling runbook for the inventory pillar
- `docs/runbooks/media-api-pillar-verification.md` — sibling runbook for the media pillar
- Track N3 PR 1 (scaffold): #2857
- Track N3 PR 3 (routing flip): #2899
- Track N3 PR 4 (sibling defer pattern): #2905
- Track N4 PR 1 (scaffold): #2856
- Track N4 PR 3 (routing flip): #2908
- Track N4 finance.db table creation: #2915
- Track N6 PR 3 (imports persistence cutover + atomic wrap): #2902
- Track N6 epic: #2842
- Track N1 PR 4 (canonical clean deletion sibling): #2907
- Track J Phase 1 PR 4 (canonical clean deletion): #2870
- Track K Phase 1 PR 4 (canonical clean deletion): #2881
- Track M4 PR 3 (sibling defer pattern): #2900
- Track M5 PR 3 (sibling defer pattern): #2901
- Residual cross-DB transaction wrap issue: #2921

# Finance API Pillar Verification Runbook

Verification drill for the **finance pillar** container after the ADR-026 Phase 3 migration. Run this before flipping Track E to ✅ Done.

## What finance-api owns today

After finance pillar Phase 3:

- `apps/pops-finance-api/` ships as `ghcr.io/knoxio/pops-finance-api`, listens on port 3004 inside the container network (3001=core, 3002=inventory, 3003=media, 3004=finance).
- Endpoints exposed: `GET /health`.
- `finance.db` (separate SQLite file from `pops.db`, `core.db`, `inventory.db`, and `media.db`) holds the `wish_list` table today; subsequent slices (`budgets`, `transactions`, `transaction_corrections`, `transaction_tag_rules`, `tag_vocabulary`) move their tables across in later phases. Phase 2 PR 3 cut pops-api over to `getFinanceDrizzle()` for wish-list reads/writes.
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

## Reference

- ADR-026: per-domain pillar architecture
- `apps/pops-finance-api/src/server.ts` — boot sequence
- `apps/pops-shell/src/app/pillars/pillar-registry-client.ts` — soft-fallback behaviour (shared with core)
- `docs/runbooks/core-api-pillar-verification.md` — sibling runbook for the core pillar
- `docs/runbooks/inventory-api-pillar-verification.md` — sibling runbook for the inventory pillar
- `docs/runbooks/media-api-pillar-verification.md` — sibling runbook for the media pillar
- Track N3 PR 1 (scaffold): #2857
- Track N3 PR 3 (routing flip): #2899
- Track J Phase 1 PR 4 (canonical clean deletion): #2870
- Track K Phase 1 PR 4 (canonical clean deletion): #2881
- Track M4 PR 3 (sibling defer pattern): #2900
- Track M5 PR 3 (sibling defer pattern): #2901

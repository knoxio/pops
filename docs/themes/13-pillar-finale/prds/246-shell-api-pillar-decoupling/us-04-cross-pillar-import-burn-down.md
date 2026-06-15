# US-04: Burn down the 8 H8 cross-pillar imports in `apps/pops-api/src/modules/`

> PRD: [PRD-246 — Shell + API pillar decoupling](README.md)

## Description

As a pillar maintainer, I want each of the 8 cross-pillar runtime import sites inside `apps/pops-api/src/modules/<src>` (audit finding H8) to be either rewritten against the typed `pillar('<other>').*` SDK or explicitly handed off to a tracked successor PRD. Each closed site shrinks `.dependency-cruiser-known-violations.json`; the rule generator from [PRD-156](../156-consumer-import-discipline/README.md) stays untouched.

## Blocked on (SDK surface PRDs)

A scoping audit confirmed that all 8 sites are blocked on either a cross-pillar SDK surface that does not yet exist, or on Epic 08a's directory relocation. PRD-246's "Out of Scope" forbids adding the SDK machinery here, so US-04 cannot land until the following PRDs ship their surface USs:

| Sites blocked    | Unblock PRD                                                                 | What it ships                                                                                              |
| ---------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Site 1           | [PRD-249](../249-cerebrum-embeddings-sdk-surface/README.md)                 | Read-only `pillar('cerebrum').embeddings.{getStatus, listSourceIdsByType}`                                  |
| Sites 4, 5, 6, 7 | [PRD-248](../248-cerebrum-debrief-sdk-surface/README.md)                    | `pillar('cerebrum').debrief.{record, dismiss, listPending, create, get, getByMedia, logWatchCompletion, deleteByWatchHistoryId}` + Option D mixed-tx pattern from [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md) |
| Site 8           | [PRD-247](../247-core-settings-sdk-surface/README.md)                       | `pillar('core').settings.{get, set, ensure, delete, getMany, setMany}` (with `getMany` non-negotiable for hot Plex paths) |
| Sites 2, 3       | **Punted to Epic 08a** ([PRD-203](../203-directory-move-namespace-rename/README.md)) | Directory relocation of `core/corrections` + `core/tag-rules` into finance. Per [`corrections-finance-coupling.md`](../../notes/corrections-finance-coupling.md), the relocation is the right unblock vector — not an SDK surface. PRD-246 does not author an SDK PRD for these sites. |

Each blocked site closes by **(a)** the consumer side of the corresponding unblock PRD landing (the call-site flip lives there, not here), and **(b)** US-04 ticking the site off as `Done`. US-04's role is to track the burn-down at the cross-cutting level; the per-site call-site flips ship under each unblock PRD.

## Acceptance Criteria

For each of the 8 sites listed below, exactly one of:

- the site's call paths convert to a typed `pillar('<other>').*` SDK call against the target pillar's `-api`, AND the matching entry in `.dependency-cruiser-known-violations.json` is removed in the same commit, OR
- the site is explicitly blocked behind a tracked successor (named below or in a follow-up PRD reference) and PRD-246's epic table marks the site `Blocked` with the successor link.

The 8 sites (verified against [`pillar-isolation-audit.md`](../../notes/pillar-isolation-audit.md) §H8):

### Site 1 — core → cerebrum embeddings

- **File**: `apps/pops-api/src/modules/core/embeddings/service.ts`
- **Target**: `@pops/cerebrum-db` (`embeddings` table)
- **Unblock PRD**: [PRD-249](../249-cerebrum-embeddings-sdk-surface/README.md) ships the read-only `pillar('cerebrum').embeddings.{getStatus, listSourceIdsByType}` surface + the consumer-side flip. The call-site rewrite lives in PRD-249 US-02.
- **Acceptance** (tracked here for the burn-down summary): `apps/pops-api/src/modules/core/embeddings/service.ts` contains no `@pops/cerebrum-db` runtime import; the matching allow-list entry is gone; the embeddings service unit + integration tests pass.

### Site 2 — core → finance tag vocabulary

- **Files**: `apps/pops-api/src/modules/core/tag-rules/router.ts`, `service.ts`, `preview.ts`
- **Target**: `@pops/finance-db` (`tagVocabularyService`)
- **Unblock vector**: **Punted to Epic 08a** ([PRD-203](../203-directory-move-namespace-rename/README.md)). The audit + [`corrections-finance-coupling.md`](../../notes/corrections-finance-coupling.md) reject an SDK surface as the unblock vector — `tag-rules` is finance-owned-misnamed-as-core, and the right fix is the directory relocation, not a `pillar('finance').tagVocabulary.*` proxy. No PRD-247/248/249 sibling is authored for this site.
- **Acceptance** (closed by PRD-203 cutover, tracked here for completeness): the three files contain no `@pops/finance-db` import (because the files have moved into finance-api); the matching allow-list entries are gone; the tag-rules router + preview tests pass under finance-api.

### Site 3 — core → finance corrections

- **Files**: `apps/pops-api/src/modules/core/corrections/handlers/pattern-match.ts`, `query-helpers.ts`
- **Target**: `@pops/finance-db`
- **Unblock vector**: **Punted to Epic 08a** ([PRD-203](../203-directory-move-namespace-rename/README.md)). Same argument as Site 2 per [`corrections-finance-coupling.md`](../../notes/corrections-finance-coupling.md): corrections is finance-owned-misnamed-as-core, and the right fix is the directory relocation. No PRD-247/248/249 sibling is authored for this site.
- **Acceptance** (closed by PRD-203 cutover, tracked here for completeness): the two files contain no `@pops/finance-db` import (because the files have moved into finance-api); the matching allow-list entry is gone; the corrections handlers tests pass under finance-api.

### Site 4 — media → cerebrum debrief writes (record)

- **File**: `apps/pops-api/src/modules/media/comparisons/lib/debrief-record.ts`
- **Target**: `@pops/cerebrum-db` (`debriefResults`, `debriefSessions`, `debriefStatus`)
- **Unblock PRD**: [PRD-248](../248-cerebrum-debrief-sdk-surface/README.md) ships `pillar('cerebrum').debrief.record(...)` + the consumer-side flip. Call-site rewrite lives in PRD-248 US-05.
- **Acceptance** (tracked here for completeness): the file contains no `@pops/cerebrum-db` runtime import; the allow-list entry is gone; the debrief-record integration tests pass.

### Site 5 — media → cerebrum debrief writes (dismiss + pending)

- **Files**: `apps/pops-api/src/modules/media/comparisons/lib/debrief-dismiss.ts`, `debrief-pending.ts`
- **Target**: `@pops/cerebrum-db`
- **Unblock PRD**: [PRD-248](../248-cerebrum-debrief-sdk-surface/README.md) ships `pillar('cerebrum').debrief.{dismiss, listPending}` + the consumer-side flip. Call-site rewrite lives in PRD-248 US-05.
- **Acceptance** (tracked here for completeness): the two files contain no `@pops/cerebrum-db` runtime import; the allow-list entry is gone; debrief-dismiss + debrief-pending tests pass.

### Site 6 — media debrief namespace → cerebrum

- **Files**: `apps/pops-api/src/modules/media/debrief/service.ts`, `queue-status.ts`
- **Target**: `@pops/cerebrum-db`
- **Unblock PRD**: [PRD-248](../248-cerebrum-debrief-sdk-surface/README.md) ships the full `pillar('cerebrum').debrief.*` surface (`create`, `get`, `getByMedia`, etc.) and the media-side rewrite picks option (b) — the namespace stays under media and calls cerebrum through the SDK. `getDebriefByMedia`'s SQL inner-join is replaced by `getByMedia` (denormalised, no join). Call-site rewrite lives in PRD-248 US-05.
- **Acceptance** (tracked here for completeness): the two files contain no `@pops/cerebrum-db` runtime import; the allow-list entry is gone; the debrief service tests pass.

### Site 7 — media → cerebrum watch-history reads

- **File**: `apps/pops-api/src/modules/media/watch-history/handlers/query-helpers.ts`, `log-watch-event.ts` (Option D mixed-tx)
- **Target**: `@pops/cerebrum-db`
- **Unblock PRD**: [PRD-248](../248-cerebrum-debrief-sdk-surface/README.md) — denormalisation already landed (commit 9df171fe), and the `logWatchCompletion` SDK shape encapsulates the mixed-tx pattern. The `log-watch-event.ts` rewrite is the Option D split (media tx commits first, SDK call is best-effort post-commit). Call-site rewrite lives in PRD-248 US-05.
- **Acceptance** (tracked here for completeness): the file contains no `@pops/cerebrum-db` runtime import; the allow-list entry is gone; the watch-history query-helpers tests pass; the Option D partial-failure path is covered by PRD-248 US-06's integration test.

### Site 8 — media → core settings reads (`arr`, `plex`, `rotation`, ~15 files)

- **Files**: `apps/pops-api/src/modules/media/arr/...`, `apps/pops-api/src/modules/media/plex/...`, `apps/pops-api/src/modules/media/rotation/...` — verify the exact list at PR time by grepping the `apps/pops-api/src/modules/media` tree for `@pops/core-db`. Current count is 15 files (the audit estimate of ~10 was low).
- **Target**: `@pops/core-db` (settings reads + writes)
- **Unblock PRD**: [PRD-247](../247-core-settings-sdk-surface/README.md) ships `pillar('core').settings.{get, set, ensure, delete, getMany, setMany}` with the `getMany` shape designed-in (non-negotiable for hot Plex paths). Call-site rewrite lives in PRD-247 US-03. The pattern doc (PRD-247 US-02) is also the reference for PRD-248 and PRD-249.
- **Acceptance** (tracked here for completeness): every media file under `arr`, `plex`, `rotation` contains no `@pops/core-db` runtime import (type-only for `SETTINGS_KEYS` is allowed); all matching allow-list entries are gone; hot Plex paths use `getMany`; the affected media-module tests pass.

### Cross-cutting acceptance

- [ ] `.dependency-cruiser-known-violations.json` shrinks by exactly the entries PRD-246 closes. The file is not deleted (sites blocked behind successors keep their entries; new entries cannot land without [PRD-156](../156-consumer-import-discipline/README.md)'s gate).
- [ ] The full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean after each site lands. CI must stay green commit-to-commit; do not batch up a broken intermediate.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Sites can land in any order and any grouping. Site 8 (media → core settings reads) is the largest by file count and likely the highest-leverage single PR. Sites 2 + 3 (core → finance) overlap with Epic 08a's reclaim; coordinate with whoever picks up 08a so the import decoupling and the file relocation don't fight each other.
- Sites 4 + 5 + 6 all share the cerebrum-debrief mixed-tx concern. Read [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md) before starting any of them. If the mixed-tx coordination strategy is not yet decided, those sites are the natural place to make the call (or hand off to a sibling PRD).
- For each site, the rewrite is a function-by-function call-site change; the data shape exposed by the target pillar's typed proxy comes from its existing contract package. If the proxy does not expose the required shape, surface it as a [PRD-244](../244-cross-pillar-sdk-surface/README.md) input rather than landing a `pillar.<other>.callDynamic` escape hatch inside PRD-246.
- US-04 is independent of US-01..US-03. The H8 burn-down is parallel work to the H9 cleanup.

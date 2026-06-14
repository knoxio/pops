# US-04: Burn down the 8 H8 cross-pillar imports in `apps/pops-api/src/modules/`

> PRD: [PRD-245 — Shell + API pillar decoupling](README.md)

## Description

As a pillar maintainer, I want each of the 8 cross-pillar runtime import sites inside `apps/pops-api/src/modules/<src>` (audit finding H8) to be either rewritten against the typed `pillar('<other>').*` SDK or explicitly handed off to a tracked successor PRD. Each closed site shrinks `.dependency-cruiser-known-violations.json`; the rule generator from [PRD-156](../156-consumer-import-discipline/README.md) stays untouched.

## Acceptance Criteria

For each of the 8 sites listed below, exactly one of:

- the site's call paths convert to a typed `pillar('<other>').*` SDK call against the target pillar's `-api`, AND the matching entry in `.dependency-cruiser-known-violations.json` is removed in the same commit, OR
- the site is explicitly blocked behind a tracked successor (named below or in a follow-up PRD reference) and PRD-245's epic table marks the site `Blocked` with the successor link.

The 8 sites (verified against [`pillar-isolation-audit.md`](../../notes/pillar-isolation-audit.md) §H8):

### Site 1 — core → cerebrum embeddings

- **File**: `apps/pops-api/src/modules/core/embeddings/service.ts`
- **Target**: `@pops/cerebrum-db` (`embeddings` table)
- **Proposed SDK shape**: `pillar('cerebrum').embeddings.*` — both reads and writes routed through cerebrum-api. If cerebrum-api does not yet expose the matching endpoints, that gap is handed off to [PRD-244](../244-cross-pillar-sdk-surface/README.md).
- **Acceptance**: `apps/pops-api/src/modules/core/embeddings/service.ts` contains no `@pops/cerebrum-db` import; the matching allow-list entry is gone; the embeddings service unit + integration tests pass.

### Site 2 — core → finance tag vocabulary

- **Files**: `apps/pops-api/src/modules/core/tag-rules/router.ts`, `service.ts`, `preview.ts`
- **Target**: `@pops/finance-db` (`tagVocabularyService`)
- **Proposed SDK shape**: `pillar('finance').tagVocabulary.*`. Epic 08a will eventually relocate `tag-rules` into finance-api; PRD-245's scope is the import-decoupling only. The relocation closes the cross-pillar shape entirely.
- **Acceptance**: the three files contain no `@pops/finance-db` import; the matching allow-list entry is gone; the tag-rules router + preview tests pass.

### Site 3 — core → finance corrections

- **Files**: `apps/pops-api/src/modules/core/corrections/handlers/pattern-match.ts`, `query-helpers.ts`
- **Target**: `@pops/finance-db`
- **Proposed SDK shape**: `pillar('finance').corrections.*`. See [`corrections-finance-coupling.md`](../../notes/corrections-finance-coupling.md) for the design context. Epic 08a eventually moves the file entirely.
- **Acceptance**: the two files contain no `@pops/finance-db` import; the matching allow-list entry is gone; the corrections handlers tests pass.

### Site 4 — media → cerebrum debrief writes (record)

- **File**: `apps/pops-api/src/modules/media/comparisons/lib/debrief-record.ts`
- **Target**: `@pops/cerebrum-db` (`debriefResults`, `debriefSessions`, `debriefStatus`)
- **Proposed SDK shape**: `pillar('cerebrum').debrief.record(...)`. The mixed-transaction concern is captured in [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md) — read it before designing the cutover.
- **Acceptance**: the file contains no `@pops/cerebrum-db` import; the allow-list entry is gone; the debrief-record integration tests pass with the new mixed-tx coordination strategy.

### Site 5 — media → cerebrum debrief writes (dismiss + pending)

- **Files**: `apps/pops-api/src/modules/media/comparisons/lib/debrief-dismiss.ts`, `debrief-pending.ts`
- **Target**: `@pops/cerebrum-db`
- **Proposed SDK shape**: `pillar('cerebrum').debrief.{dismiss,listPending}(...)`. Same mixed-tx design as Site 4; the dismiss / pending operations are the lighter-weight cases.
- **Acceptance**: the two files contain no `@pops/cerebrum-db` import; the allow-list entry is gone; debrief-dismiss + debrief-pending tests pass.

### Site 6 — media debrief namespace → cerebrum

- **Files**: `apps/pops-api/src/modules/media/debrief/service.ts`, `queue-status.ts`
- **Target**: `@pops/cerebrum-db`
- **Proposed SDK shape**: either (a) fold the media-side `debrief` namespace into cerebrum-api and have media call back via `pillar('cerebrum').debrief.*`, or (b) keep the namespace under media and have it call cerebrum through the SDK. Pick at PR time based on which side owns the orchestration. The mixed-tx design doc weighs in.
- **Acceptance**: the two files contain no `@pops/cerebrum-db` import; the allow-list entry is gone; the debrief service tests pass.

### Site 7 — media → cerebrum watch-history reads

- **File**: `apps/pops-api/src/modules/media/watch-history/handlers/query-helpers.ts`
- **Target**: `@pops/cerebrum-db`
- **Proposed SDK shape**: `pillar('cerebrum').watchHistory.*`. The denormalisation that landed in commit 9df171fe (`media_type` + `media_id` columns on `debrief_sessions`) reduces but does not eliminate the cross-pillar read.
- **Acceptance**: the file contains no `@pops/cerebrum-db` import; the allow-list entry is gone; the watch-history query-helpers tests pass.

### Site 8 — media → core settings reads (`arr`, `plex`, `rotation`, ~10 files)

- **Files**: `apps/pops-api/src/modules/media/arr/...`, `apps/pops-api/src/modules/media/plex/...`, `apps/pops-api/src/modules/media/rotation/...` — verify the exact list at PR time by grepping the `apps/pops-api/src/modules/media` tree for `@pops/core-db`. The audit estimates ~10 files.
- **Target**: `@pops/core-db` (settings reads)
- **Proposed SDK shape**: `pillar('core').settings.get(...)`. This is half the H8 list by file count and the cleanest opportunity for a single "settings reads go through the SDK" PR.
- **Acceptance**: every media file under `arr`, `plex`, `rotation` (or wherever the grep finds matches) contains no `@pops/core-db` import; all matching allow-list entries are gone; the affected media-module tests pass.

### Cross-cutting acceptance

- [ ] `.dependency-cruiser-known-violations.json` shrinks by exactly the entries PRD-245 closes. The file is not deleted (sites blocked behind successors keep their entries; new entries cannot land without [PRD-156](../156-consumer-import-discipline/README.md)'s gate).
- [ ] The full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean after each site lands. CI must stay green commit-to-commit; do not batch up a broken intermediate.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Sites can land in any order and any grouping. Site 8 (media → core settings reads) is the largest by file count and likely the highest-leverage single PR. Sites 2 + 3 (core → finance) overlap with Epic 08a's reclaim; coordinate with whoever picks up 08a so the import decoupling and the file relocation don't fight each other.
- Sites 4 + 5 + 6 all share the cerebrum-debrief mixed-tx concern. Read [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md) before starting any of them. If the mixed-tx coordination strategy is not yet decided, those sites are the natural place to make the call (or hand off to a sibling PRD).
- For each site, the rewrite is a function-by-function call-site change; the data shape exposed by the target pillar's typed proxy comes from its existing contract package. If the proxy does not expose the required shape, surface it as a [PRD-244](../244-cross-pillar-sdk-surface/README.md) input rather than landing a `pillar.<other>.callDynamic` escape hatch inside PRD-245.
- US-04 is independent of US-01..US-03. The H8 burn-down is parallel work to the H9 cleanup.

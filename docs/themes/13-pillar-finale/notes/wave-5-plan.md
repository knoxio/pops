# Theme 13 Wave 5 — Plan

> Snapshot date: 2026-06-14.
>
> Related notes:
>
> - [Wave 5 handler-state audit](wave-5-handler-state-audit.md) — categorised
>   per-pillar breakdown of every `getDrizzle()` mention (handler-real,
>   test-mock, JSDoc-only, documented pin, shared-only schema pin).
> - [Wave 5 blocked](wave-5-blocked.md) — the gating conditions for PRD-213
>   (drop `pops.db`) and PRD-214 (legacy code retirement).
> - [PRD-212 readiness matrix](../prds/212-readiness-audit/readiness-matrix.md) — per-table backfill state.

Wave 5 is the migration tail of Theme 13: cut every remaining production
handler off the shared `getDrizzle()` / `pops.db` lazy singleton and onto
the matching per-pillar `get<Pillar>Drizzle()` handle so PRD-213 can author
the final drop migration.

## Headline numbers

Latest sweep (2026-06-14) on `apps/pops-api/src/` only — `packages/`,
`apps/pops-*-api/`, and all other workspaces are clean.

| Metric                                                     |   Count |
| ---------------------------------------------------------- | ------: |
| Raw `getDrizzle` matches (incl. `dist/`)                   |     511 |
| Raw matches excluding `dist/`                              |     483 |
| Files touched (excluding `dist/`)                          |     145 |
| **Production-side runtime call sites**                     | **153** |
| Production-side files                                      |      76 |
| Stale `vi.mock` blocks (silent-failure surface, in-flight) |      10 |
| Test-side direct calls (real shared DB)                    |     163 |
| Test-mock entries                                          |      42 |
| JSDoc / comment mentions (cosmetic)                        |      44 |

The "153 production-side runtime call sites" line is the actionable target.
Every other category is either already in flight (stale mocks), follows the
SUT migration mechanically (test-side direct calls), or is cosmetic.

## Pillar rollup

153 runtime sites are concentrated in **3 pillars**. The other 4 are clean.

| Pillar    | Runtime real | Test real | Test mock | Total | % real | Status    |
| --------- | -----------: | --------: | --------: | ----: | -----: | --------- |
| food      |           91 |       110 |        16 |   217 |    42% | queued    |
| media     |           43 |        91 |        40 |   174 |    25% | queued    |
| cerebrum  |           16 |        24 |         2 |    42 |    38% | in-flight |
| core      |            0 |        10 |         0 |    10 |     0% | done      |
| finance   |            0 |        16 |         2 |    18 |     0% | done      |
| lists     |            0 |         0 |         0 |     0 |      — | done      |
| inventory |            0 |         0 |         0 |     0 |      — | done      |

(Test-real / test-mock columns come from the handler-state audit's
per-pillar breakdown; the 10 stale `vi.mock` blocks are distributed across
media (~4), food (~3), cerebrum (~2), core (~1) and are closed in a
parallel PR.)

`pkg-*`, `finance-svc`, `media-svc`, `api-shared`, and all `apps/pops-*-api/`
external pillars register zero raw matches. They have already exited.

## Per-pillar slice plan

### 1. Stale-mock cleanup (in flight)

Single PR closing the 10 stale `vi.mock('.../db.js', () => ({ getDrizzle: ... }))`
blocks whose underlying SUT no longer calls `getDrizzle()`. These mocks
silently mask SUT-side migrations and shadow real assertions — the
handler-state audit calls them out as the highest-priority hygiene fix
because they create a "tests pass but production is broken" gap when the
SUT migration ships.

Detection technique: for each `vi.mock` block referencing the db module,
grep the SUT file for a literal `getDrizzle(` call. Zero hits = stale mock.
Run pillar-by-pillar; safe to merge before any handler cutover.

### 2. Cerebrum cutover (queued next — 16 sites, ~12 files)

Small enough to land as a single PR. The `getCerebrumDrizzle()` handle
already exists and is exercised by `nudge_log` writes (#3167). Remaining
sites split into:

- **HybridSearchService instantiations (11 sites)** — pinned by PRD-179 PR4
  until cross-pillar enrichment joins are restructured. Stay on shared
  until that lands. Out of scope for the cerebrum cutover PR.
- **`reflex_executions` reads/writes (4 sites)** — schema is shared-only.
  Either lift `reflex_executions` into `@pops/cerebrum-db` (preferred) or
  defer with a documented pin. Decision goes in the PR description.
- **`thalamus/router.ts` `CrossSourceIndexer` (1 site)** — pinned by
  design; add JSDoc rationale and leave on shared.

Expected delta after this PR: 16 → 5 (with 11 documented pins waiting on
PRD-179 PR4).

### 3. Media cutover (3 PRs, by natural seam)

43 runtime sites. Split by submodule so each PR has a clean blast radius
and its own test-fixture sweep. Order does not matter — submodules are
independent.

| PR    | Scope (`apps/pops-api/src/modules/media/...`) | Notes                                                                                                                            |
| ----- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| PR-M1 | `discovery/`, `shelf/`                        | Includes the `discovery/shelf/local-*-shelves.ts` cluster. Pure reads; trivial flip once tables are exposed by `@pops/media-db`. |
| PR-M2 | `plex/`                                       | `plex/sync-watchlist.ts:84` cross-app write to `mediaWatchlist.plexRatingKey` stays on shared (documented pin per audit).        |
| PR-M3 | `tv-shows/`                                   | `tv-shows-base.ts`, `episodes-service.ts`, `seasons-service.ts`. Self-contained.                                                 |

Sites NOT in the above (stay pinned):

- `comparisons/` cluster (50 lines) — blocked behind per-table PR4 sweep.
- `rotation/` cluster (24 lines) — same.
- `watch-history/handlers/query-helpers.ts` deleter — documented mixed-tx
  pin (cross-table tx with `debriefSessions`/`debriefResults`); blocked
  behind cerebrum debrief tables shipping to `@pops/cerebrum-db`.

These three PRs land the cleanly-actionable subset. The pinned residue
unblocks as per-table PR4s ship.

### 4. Food cutover (4+ PRs, by sub-area)

91 runtime sites, the long tail. Split by sub-area; each PR is independent
and follows the `prep_states` shape that already shipped (commit
3439c8d3): backfill + barrel + handler flip + shared drop.

| PR    | Scope (`apps/pops-api/src/modules/food/...`)                                                             | Top sites                |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------------ |
| PR-F1 | `recipes/`                                                                                               | `recipes/router.ts` (13) |
| PR-F2 | `routers/ingredients.ts`, `routers/substitutions.ts`, `routers/aliases.ts`, `routers/ingredient-tags.ts` | 9 + 7 + 7 + 4            |
| PR-F3 | `inbox/`, `conversions/`                                                                                 | 9 + 9                    |
| PR-F4 | `plan/`, `batches/`, `cook/`, `fridge/`, `shopping/`                                                     | 7 + 7 + 2 + 2 + 2        |

Top 10 highest-priority single files (across PR-F1–F4):

1. `food/recipes/router.ts` — 13
2. `food/routers/ingredients.ts` — 9
3. `food/inbox/router.ts` — 9
4. `food/conversions/router.ts` — 9
5. `food/routers/substitutions.ts` — 7
6. `food/routers/aliases.ts` — 7
7. `food/plan/router.ts` — 7
8. `food/batches/router.ts` — 7
9. `food/routers/ingredient-tags.ts` — 4
10. `food/plan/slot-procedures.ts` — 4

Each food PR pairs with its underlying table's PR4 — handler flip alone
without the matching backfill + barrel + shared-drop silently loses writes
until the shared row is deleted.

## Exit criteria

The previous draft assumed a ~30-site "done threshold". That number is
stale. The revised criteria:

1. **Production-side runtime sites in `apps/pops-api/src/` drop to ≤ 20**,
   each carrying an inline JSDoc cross-pillar-pin rationale and a tracking
   PRD link.
2. **Per-pillar runtime-real counts**: cerebrum, media, food all ≤ 10
   each.
3. **All 10 stale `vi.mock` blocks closed** (Step 1).
4. **Test-side direct calls are NOT a gate.** They migrate mechanically as
   each SUT's PR4 ships; tracking them as a Wave-5 acceptance gate
   inflates scope by 163 sites of trivial fixture work.
5. **The four conditions from `wave-5-blocked.md` hold** (zero non-test
   `getDrizzle()` outside the documented-pin set, drizzle journal empty
   or only the final drop migration, `migration-ownership.ts` empty,
   cross-pillar infra hot-paths owned).

Condition (1) is the new substantive threshold. The previous "30 sites"
figure pre-dated the documented-pin / shared-only-schema-pin distinction
that the handler-state audit made explicit. With that distinction, ≤20
documented pins is the realistic floor — the remainder is pinned by
PRD-179 PR4 (HybridSearchService) and the mixed-tx design.

When (1)–(5) hold, PRD-213 US-01 (the drop migration) and PRD-214 (legacy
code retirement) can ship.

## Silent-failure pattern (stale vi.mock)

A recurring Wave-5 hazard: a test file declares
`vi.mock('../../../db.js', () => ({ getDrizzle: vi.fn(...) }))` to stub
the shared handle, then the SUT migrates to `get<Pillar>Drizzle()`. The
mock keeps satisfying TypeScript and the tests keep passing, but the SUT
no longer hits the mocked surface. Two failure modes follow:

- **Production drift.** If the SUT-side migration introduces a regression,
  the test that should catch it is exercising a stub that nothing calls.
- **Verification gap.** Reviewers reading the test infer "this mocks the
  db handle, so the test covers the db path" — but the mock is dead code.

Detection (one-liner per pillar):

```sh
# inside each pillar's __tests__/ dir
for f in $(grep -lE "vi\.mock\(.*db(\.js)?'.*getDrizzle" .); do
  sut=$(grep -oE "vi\.mock\('([^']+)'" "$f" | head -1 | sed -E "s/vi.mock\('//;s/'//")
  # resolve $sut path relative to $f, then:
  grep -q "getDrizzle(" "$sut_resolved" || echo "STALE: $f"
done
```

The handler-state audit found 10 such blocks across cerebrum, media,
food, and core. They are closed in a parallel PR ahead of the cerebrum
cutover.

## Out of scope for Wave 5

- Authoring the final drop migration (PRD-213 US-01) — gated by exit
  criteria above.
- Touching `db.ts`, `migration-ownership.ts`, or
  `infra/docker-compose.yml` SQLITE_PATH wiring — same gate.
- Retiring `backfill-cerebrum-from-shared.ts` — harmless until the
  `nudge_log` writer flip (PRD-149) lands; tracked separately.
- Test-side handle hygiene PRs — sequenced per pillar after its SUT
  migration ships, not gating Wave 5.

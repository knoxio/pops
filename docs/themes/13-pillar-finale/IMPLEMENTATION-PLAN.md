# Theme 13 — Pillar Finale: Implementation Plan

> Companion to the [theme README](README.md). The README spells out the _what_; this doc spells out the _how, when, and by whom_.

## North Star

**Pillars must be independent except for their published contracts.** Pillar A ships without pillar B's source. Cross-pillar communication is via published `@pops/<pillar>-contract` packages or the runtime `pillar('<id>')` SDK — never direct internal imports.

## Headline status

- **20 PRDs Done.** Foundation, registry/SDK, settings dimension, dynamic AppRouter, shell decoupling, db-types decomposition (7/8 USs).
- **1 PRD In progress.** PRD-245 US-08 (final db-types cleanup).
- **3 PRDs Queued.** PRD-247/248/249 (cross-pillar SDK surfaces) at US-01 (schema). US-02+ unblocks PRD-246 US-04.
- **Anti-lego audit 2026-06.** 18 findings (4 HIGH / 8 MEDIUM / 6 LOW), down from 28. HIGH = H6 (53 `@pops/db-types` consumers), H7 (4 cross-pillar denorm pairs), H8 (33 cross-pillar imports in pops-api), H-D1 (per-pillar Dockerfiles copy every other pillar's src). See [notes/pillar-isolation-audit-2026-06.md](notes/pillar-isolation-audit-2026-06.md).
- **Production:** capivara healthy. CI green on main.

## PRD status

### Done

| PRD | Title                                                                     |
| --- | ------------------------------------------------------------------------- |
| 227 | SDK affordances (callDynamic, fetchQuery, cache-write, infinite, queries) |
| 228 | Dynamic pillar registration                                               |
| 229 | HA bridge pillar (incl. retention cron)                                   |
| 231 | Cross-language wire-format spec                                           |
| 232 | Nginx generator dynamic-source                                            |
| 233 | Rust reference pillar                                                     |
| 236 | Sinks manifest dimension                                                  |
| 237 | pops → HA event publisher                                                 |
| 238 | Settings imports migration                                                |
| 239 | Settings physical relocation                                              |
| 240 | Settings as manifest dimension                                            |
| 241 | Registry-driven known-modules                                             |
| 242 | Dynamic AppRouter composition                                             |
| 243 | Registry-driven shell UI                                                  |
| 244 | Cross-pillar SDK surface (typed proxy pattern)                            |
| 245 | db-types decomposition US-01..07 (US-08 in progress)                      |
| 246 | Shell + API pillar decoupling US-01/02/03 (US-04/05 blocked)              |

### In progress

| PRD   | US                                                                     | Notes                                                |
| ----- | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| 245   | US-08 — delete `db-types/schema/` dir, slim or remove `@pops/db-types` | Closes PRD-245 100%                                  |
| Audit | Anti-lego smell refresh                                                | Produces fresh findings doc + recommended next moves |

### Blocked

| PRD | US                                                                     | Blocker                                                                                               |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 246 | US-04 — burn down 8 H8 cross-pillar imports in pops-api                | Target pillar SDK surfaces don't exist yet. PRD-246 "Out of Scope" forbids adding SDK machinery here. |
| 246 | US-05 — integration test (synthetic pillar contributes captureOverlay) | Cosmetic gate on US-04                                                                                |

### Queued (SDK surfaces — unblocks 246 US-04)

| PRD | Scope                                                 | US-01 (schema) | Remaining                                                                   |
| --- | ----------------------------------------------------- | -------------- | --------------------------------------------------------------------------- |
| 247 | `core.settings.*` SDK + 15-file media call-site flips | Done           | US-02 server-side consumer pattern · US-03 handlers · US-04 call-site flips |
| 248 | `cerebrum.debrief.*` 8-method SDK + mixed-tx Option D | Done           | US-02..06 write/read/delete + per-site flips + integration test             |
| 249 | `cerebrum.embeddings.*` read-only SDK                 | Done           | US-02 handlers · US-03 single call-site flip                                |

### Punted (deliberately out of Theme 13)

| Topic                                                           | Why                                                                                                                                                                                            | Recorded in         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `core/tag-rules` + `core/corrections` (PRD-246 US-04 Sites 2–3) | `corrections-finance-coupling.md` argues SQL-side normalisers + unbounded SELECTs don't survive HTTP serialisation. Right close is **Epic 08a / PRD-203** directory relocation, not SDK proxy. | PRD-274             |
| `/pillars/<name>/` flat code-topology reorg                     | Cosmetic; high churn; user said park it. Do not resume without an explicit ask.                                                                                                                | Cleanup notes below |

## Wave 5 (per-pillar DB cutover)

PRDs 213/214 (drop `pops.db` + retire legacy code) are conceptually done. The remaining work is handlers still calling `getDrizzle()`.

**Audit reality (2026-06-15 sweep):**

- 153 production runtime `getDrizzle` call sites remain
- Distribution: food (91), media (43), cerebrum (16), all other pillars ≈ 0
- **Cerebrum (16 sites)** — every site is _intentionally_ still on `getDrizzle` pending upstream migrations (PRD-179 PR 4 engram metadata split, `reflex_executions` schema relocation, `ai_usage` pillar decision). Naive flips break runtime joins.
- **Media (43 sites)** — split by submodule seam (discovery/shelf · plex · tv-shows) into 2–3 PRs.
- **Food (91 sites)** — biggest file count; ratio of `runtime-real` / total across all pillars is ~30%, expect shrinkage from test-mock pruning.

**Wave 5 exit criteria (revised, replaces "<30 sites"):**

- ≤20 production-side `getDrizzle` call sites OR each remaining site carries an inline JSDoc + tracking-PRD link explaining the pin.
- Test-side mocks are NOT a Wave 5 gate. They follow SUT migrations mechanically.
- Stale `vi.mock('@pops/db-types', ...)` silent-failure pattern: detect via `grep -r "vi.mock.*getDrizzle"` then diff against SUT actual imports.

## Theme 13 exit criteria

1. All 22 PRDs at 100% (the 17 in "Done" above + PRD-245 US-08 + PRD-246 US-04/05 + PRD-247/248/249).
2. Anti-lego audit reports 0 HIGH findings, ≤ a handful of justifiable MEDs (each annotated with next-PRD reference if the close can't ship now).
3. Wave 5 at the revised threshold above.
4. CI green on main. Publish Images succeeds on a freshly-cut main without a manual hot-fix chain.
5. Capivara healthy on the post-merge image for 24 hours minimum.

## Operational notes (for future agents)

- **PRD-245 barrel-conflict pattern.** USs touched `packages/db-types/src/schema/index.ts` + every per-app Dockerfile's build-order block. Parallel fan-out is OK but ALL but the first PR will conflict on merge → sequential rebase chain post-merge. Mostly moot after US-08 closes the barrel.
- **PRD numbering collisions** have happened twice (PRD-244, PRD-245). Always grep for the next free PRD number across BOTH the docs tree AND any open branches before authoring.
- **Agent stall threshold.** Keep simultaneous background agents ≤4 unless they touch entirely separate trees.
- **AGENTS.md auto-merge policy.** Spawned agents open the PR; the parent decides admin-merge or wait.
- **Capivara crash-loop pattern.** `FeatureNotFoundError` on boot when a feature key references a module not in the current install-set. Pattern: catch the specific error class at the boot-path call site (#3253 + #3267 examples). If a similar boot-time crash appears on a new feature key, mirror the pattern.

## Cleanup notes

These were tracked in scattered docs; folded here so those docs can be deleted.

1. **Drop `@pops/db-types`** workspace entry once US-08 lands and no consumer remains.
2. **Walk `.dependency-cruiser-known-violations.json`** after PRD-247/248/249 US-04 land; expect significant shrinkage.
3. **`/pillars/<name>/` flat code-topology reorg — parked indefinitely.** User said park it; do not resume without an explicit ask.
4. **Audit duplicate folder.** `docs/themes/13-pillar-finale/prds/244-db-types-decomposition/` is an empty stub from a number collision. The real PRD-245 is at `245-db-types-decomposition/`. Delete it.

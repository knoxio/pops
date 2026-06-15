# Theme 13 — Pillar Finale: Implementation Plan

> Companion to the [theme README](README.md). The README spells out the _what_; this doc spells out the _how, when, and by whom_.

## North Star

**Pillars must be independent except for their published contracts.** Pillar A ships without pillar B's source. Cross-pillar communication is via published `@pops/<pillar>-contract` packages or the runtime `pillar('<id>')` SDK — never direct internal imports.

## Today's progress (2026-06-15)

| Bucket    | Count | PRs / commits                                                                                                                                                                                                                |
| --------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merged    | 8     | #3279 plan-consolidation · #3281 cleanup · #3282 MCP tracking · #3285 CI build-order · #3286 PRD-251/252 stubs · #3287 PRD-250 close + final CI fixes · #3288 PRD-247 US-02 consumer doc · #3291 Wave 5 media tv-shows slice |
| Infra     | 1     | homelab-infra#12 — MCP secret-mount perms + dispatcher `POPS_PILLARS`                                                                                                                                                        |
| In-flight | 7     | #3283 PRD-245 US-08 · #3289 PRD-247 US-03 · #3290 PRD-252 US-01 · #3292 PRD-249 close · #3293 PRD-248 US-02 · #3294 food-conv PR4 · #3295 PRD-251 US-01+02                                                                   |
| Draft     | 1     | homelab-infra#13 — `POPS_REGISTRY_ENABLED` flip queued                                                                                                                                                                       |

## Headline status

- **21 PRDs Done.** Foundation, registry/SDK, settings dimension, dynamic AppRouter, shell decoupling, db-types decomposition (7/8 USs), PRD-250 pillar-sdk hardening.
- **1 PRD Done pending merge.** PRD-249 (cerebrum.embeddings.\* SDK) — closes when #3292 lands.
- **6 PRDs In progress.** PRD-245 US-08 (#3283) · PRD-247 US-03 (#3289) · PRD-248 US-02 (#3293) · PRD-251 US-01/02 (#3295) · PRD-252 US-01 (#3290) · Wave 5 cascades (PR4 chain).
- **PRD-246 US-04 unblocked once SDK trio (247/248/249) merges** — synthetic captureOverlay test (US-05) follows.
- **Anti-lego audit 2026-06.** MEDIUM M3 + M4 and LOW L9 + L-D1 closed in PR #3298 (audit MED batch) — open count now 14 (4 HIGH / 6 MEDIUM / 4 LOW). HIGH count drops from 4 → 2 once today's merges land (H6/H7 close via PRD-245 US-08 + PRD-251; H8 partially in-flight via SDK trio; H-D1 in-flight via #3290). M-D1 (food seed → lists), M-D2 (dual `app-food-db` / `food-db` shape), M1, M2, M7, M8 deferred — each needs a PRD or folds into the CI/infra consolidation PRD. Refresh after PRD-247/248/249 + #3290 land.
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
| 245 | db-types decomposition US-01..07 (US-08 in progress via #3283)            |
| 246 | Shell + API pillar decoupling US-01/02/03 (US-04/05 unblocks on SDK trio) |
| 250 | pillar-sdk BUILD_VERSION coercion + scoped self-register (#3287)          |

### Done pending merge

| PRD | PR    | Notes                                                                         |
| --- | ----- | ----------------------------------------------------------------------------- |
| 249 | #3292 | `cerebrum.embeddings.*` SDK + flip + integ — closes US-02/03/04. Awaiting CI. |

### In progress

| PRD   | US                                                           | PR    | Notes                                       |
| ----- | ------------------------------------------------------------ | ----- | ------------------------------------------- |
| 245   | US-08 — delete `db-types/schema/` dir                        | #3283 | Final cleanup; agent rebasing               |
| 247   | US-03 — `core.settings.*` handlers                           | #3289 | Mount on pops-core-api                      |
| 248   | US-02 — `cerebrum.debrief.*` write surface                   | #3293 | Mounted on cerebrum-api                     |
| 251   | US-01/02 — inventory cross-pillar denorm (H7)                | #3295 | First H7 pair                               |
| 252   | US-01 — per-pillar Dockerfile generator + drift-check (H-D1) | #3290 | Core pillar first                           |
| Wave5 | Slice PR4 cascades                                           | #3294 | food-conversions: 10 sites + migration 0059 |

### Blocked

| PRD | US                                                                     | Blocker                                                                                |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 246 | US-04 — burn down 8 H8 cross-pillar imports in pops-api                | Unblocks once #3289 / #3292 / #3293 (PRD-247/248/249) merge — SDK surfaces then exist. |
| 246 | US-05 — integration test (synthetic pillar contributes captureOverlay) | Cosmetic gate on US-04                                                                 |

### Punted (deliberately out of Theme 13)

| Topic                                                           | Why                                                                                                                                                                                            | Recorded in         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `core/tag-rules` + `core/corrections` (PRD-246 US-04 Sites 2–3) | `corrections-finance-coupling.md` argues SQL-side normalisers + unbounded SELECTs don't survive HTTP serialisation. Right close is **Epic 08a / PRD-203** directory relocation, not SDK proxy. | PRD-274             |
| `/pillars/<name>/` flat code-topology reorg                     | Cosmetic; high churn; user said park it. Do not resume without an explicit ask.                                                                                                                | Cleanup notes below |

## Wave 5 (per-pillar DB cutover)

PRDs 213/214 (drop `pops.db` + retire legacy code) are conceptually done. The remaining work is handlers still calling `getDrizzle()`.

**Audit reality (2026-06-15 sweep, pre-cascade-merge):**

- 153 production runtime `getDrizzle` call sites remain
- Distribution: food (91), media (43), cerebrum (16), all other pillars ≈ 0

**Strategy correction (2026-06-15):** "handle swap" is _not_ the right unit of work. Each slice needs a **PR4-style cascade**: relocate schema → ATTACH backfill → flip every call-site in the slice in one atomic PR. Splitting schema-move from call-site-flip leaves the codebase mid-migration and the DB cross-referenced. PR4 = schema move + ATTACH + handler flip, per slice.

**Per-pillar slice plan:**

| Pillar   | Slice                       | Status       | Tracking                                                                                                                                                 |
| -------- | --------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| food     | conversions                 | in PR #3294  | 10 sites, migration 0059                                                                                                                                 |
| food     | ingredients                 | not started  | next                                                                                                                                                     |
| food     | recipes                     | not started  | next                                                                                                                                                     |
| food     | substitutions               | not started  | next                                                                                                                                                     |
| food     | batches                     | not started  | next                                                                                                                                                     |
| food     | plan                        | not started  | next                                                                                                                                                     |
| media    | tv-shows (seasons/episodes) | merged #3291 | flipped to `getMediaDrizzle`                                                                                                                             |
| media    | discovery/shelf             | not started  | next                                                                                                                                                     |
| media    | plex                        | not started  | next                                                                                                                                                     |
| cerebrum | (16 sites)                  | pinned       | every site intentionally pinned pending PRD-179 PR 4 engram metadata split + `reflex_executions` relocation + `ai_usage` pillar decision. JSDoc on each. |

**Wave 5 exit criteria (revised, replaces "<30 sites"):**

- ≤20 production-side `getDrizzle` call sites OR each remaining site carries an inline JSDoc + tracking-PRD link explaining the pin.
- Test-side mocks are NOT a Wave 5 gate. They follow SUT migrations mechanically.
- Stale `vi.mock('@pops/db-types', ...)` silent-failure pattern: detect via `grep -r "vi.mock.*getDrizzle"` then diff against SUT actual imports.

## MCP registry seeding (open)

Discovered 2026-06-15 via a live `pops-mcp` tool-call probe. MCP boot succeeds, the HTTP transport at `/mcp` is reachable, and `tools/list` returns 30 tools, but every `tools/call` fails with "Pillar 'X' is unavailable".

Three bugs in series — two fixed in homelab-infra PR #12, one in-flight via #13 DRAFT:

1. **Secret-mount perms (fixed, #12).** `pops_api_key` was written by Ansible as `root:root 0600`, but `pops-mcp` runs as uid 1000 (node), and `docker compose secrets:`'s long-form `uid:/gid:/mode:` overrides are a Swarm-only feature ignored by plain compose. Fix: secrets role now supports per-item ownership; `pops_api_key` is `1000:1000 0440`.
2. **POPS_PILLARS on the dispatcher (fixed, #12).** `pops-api` and `pops-worker` had no `POPS_PILLARS` env, so their in-process registry only knew the synthetic `core` entry. Added the env to both, plus `POPS_API_KEY_FILE` for outgoing-call auth.
3. **Dynamic registry empty (in-flight, homelab-infra#13 DRAFT).** `POPS_REGISTRY_ENABLED` flip queued. Still needs a new PRD for either (a) boot-time self-register on each pillar API, or (b) seed core-api registry from `POPS_PILLARS`. Recommend (a).

Until (3) closes, MCP is **healthy as a process** but functionally inert for tool calls.

## Theme 13 exit criteria

1. All 22 PRDs at 100% (Done + PRD-245 US-08 + PRD-246 US-04/05 + PRD-247/248/249 + PRD-251/252) + the new MCP-registry-seeding PRD.
2. Anti-lego audit reports 0 HIGH findings, ≤ a handful of justifiable MEDs (each annotated with next-PRD reference if the close can't ship now).
3. Wave 5 at the revised threshold above.
4. CI green on main. Publish Images succeeds on a freshly-cut main without a manual hot-fix chain.
5. Capivara healthy on the post-merge image for 24 hours minimum.
6. MCP `tools/call` succeeds end-to-end for at least one tool per pillar (gates the "MCP healthy" goal).

## Operational notes (for future agents)

- **PRD-245 barrel-conflict pattern.** USs touched `packages/db-types/src/schema/index.ts` + every per-app Dockerfile's build-order block. Parallel fan-out is OK but ALL but the first PR will conflict on merge → sequential rebase chain post-merge. Mostly moot after US-08 closes the barrel.
- **PRD numbering collisions** have happened twice (PRD-244, PRD-245). Always grep for the next free PRD number across BOTH the docs tree AND any open branches before authoring.
- **Wave 5 PR4 pattern.** Per slice: schema relocation + ATTACH backfill + all handler call-site flips in ONE PR. Do not split — splitting leaves the DB cross-referenced mid-migration.
- **Agent stall threshold.** Keep simultaneous background agents ≤4 unless they touch entirely separate trees.
- **AGENTS.md auto-merge policy.** Spawned agents open the PR; the parent decides admin-merge or wait.
- **Capivara crash-loop pattern.** `FeatureNotFoundError` on boot when a feature key references a module not in the current install-set. Pattern: catch the specific error class at the boot-path call site (#3253 + #3267 examples). If a similar boot-time crash appears on a new feature key, mirror the pattern.

## Cleanup notes

These were tracked in scattered docs; folded here so those docs can be deleted.

1. **Drop `@pops/db-types`** workspace entry once US-08 (#3283) lands and no consumer remains.
2. **Walk `.dependency-cruiser-known-violations.json`** after PRD-247/248/249 US-04 land; expect significant shrinkage.
3. **`/pillars/<name>/` flat code-topology reorg — parked indefinitely.** User said park it; do not resume without an explicit ask.
4. **Audit duplicate folder.** `docs/themes/13-pillar-finale/prds/244-db-types-decomposition/` is an empty stub from a number collision. The real PRD-245 is at `245-db-types-decomposition/`. Delete it.
5. **MCP registry self-register PRD** — author once homelab-infra#13 lands the flip; PRD scope = boot-time POST to `core.registry.register` from each non-shell pillar API.

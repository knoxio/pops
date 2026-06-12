# Theme 13 — Implementation Plan

> Companion to the [theme README](README.md). The README spells out the _what_; this doc spells out the _how, when, and by whom_. Aimed at maximum parallel surface with quality gates that don't bend.

---

## Reading order

1. **Critical path** — the five PRDs every other epic blocks on. Spec them first; everything else lights up after.
2. **Wave plan** — concrete sequencing across 5 waves. Each wave names its parallel agents.
3. **Quality gates** — what must hold between waves before the next one starts.
4. **Agent topology** — how to allocate the parallel-agent budget.
5. **Risk register** — what could go wrong and how to detect it early.
6. **Full PRD checklist** — every PRD with its blockers, blockees, and status.

---

## Critical path (the load-bearing five)

Five PRDs gate everything else. Ship in order; each unblocks the next.

| Order | PRD                                                                            | Why it's critical                                                             | Estimate |
| ----- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------- |
| 1     | **[PRD-153](prds/153-contract-package-scaffold/)** — contract package scaffold | Every other PRD depends on the contract package shape. No exceptions.         | 1 week   |
| 2     | **[PRD-157](prds/157-manifest-schema-validator/)** — manifest schema           | Defines the wire format. Registry + SDK both need it.                         | 3 days   |
| 3     | **[PRD-161](prds/161-registry-schema-endpoints/)** — registry endpoints        | The runtime backbone. SDK boot, discovery, search, AI, FE all read from here. | 1 week   |
| 4     | **[PRD-158](prds/158-bootstrap-pillar-helper/)** — bootstrap helper            | The first pillar that registers proves the loop.                              | 1 week   |
| 5     | **[PRD-191](prds/191-client-surface/)** — `pillar()` SDK                       | Consumer-side API. Search + AI + FE + worker can't migrate without it.        | 1 week   |

**Run this critical path serially against ONE pillar (finance — most mature post-Theme 12) before fanning out.** Don't try to ship E00 across all 7 contracts before E01 lands; that's how you accumulate untested foundational PRs.

After the critical path is green on finance end-to-end, the rest unfolds in parallel.

---

## Wave plan

Five waves. Each wave is a set of PRDs that can ship concurrently. Waves are gated by quality criteria, not just merges.

### Wave 1 — Foundation (sequential, finance-pilot)

**Goal:** prove the contract → SDK → registry → bootstrap → consumption loop end-to-end on the finance pillar.

| PRD                                          | Order                 | Owner agent           |
| -------------------------------------------- | --------------------- | --------------------- |
| 153 contract scaffold (finance pilot)        | 1                     | `a:contract-scaffold` |
| 154 semver CI + affected rebuild             | 1 (parallel with 153) | `a:semver-ci`         |
| 156 import discipline lint rule              | 1 (parallel with 153) | `a:lint-rule`         |
| 157 manifest schema                          | 2                     | `a:manifest-schema`   |
| 161 registry endpoints                       | 3                     | `a:registry-core`     |
| 162 heartbeat lifecycle                      | 3 (parallel with 161) | `a:heartbeat`         |
| 158 bootstrap helper (finance pilot)         | 4                     | `a:bootstrap-pilot`   |
| 159 discovery client                         | 4 (parallel with 158) | `a:discovery`         |
| 160 capability projection types              | 4 (parallel with 158) | `a:projections`       |
| 155 manifest type generation (finance pilot) | 4 (parallel with 158) | `a:manifest-gen`      |
| 191 client surface                           | 5                     | `a:client-sdk`        |
| 192 server surface                           | 5 (parallel with 191) | `a:server-sdk`        |

**Wave 1 exit criteria:**

- Finance pillar boots with `bootstrapPillar(manifest, app)`
- Registers with core-api on boot, heartbeats every 10s
- `pillar('finance').wishlist.list({})` works end-to-end from pops-shell (or a test harness)
- Contract semver CI (PRD-154) catches at least one synthetic breaking change in tests
- Import discipline lint (PRD-156) baseline is committed

**Wave 1 duration:** 6-8 weeks.

### Wave 2 — Foundation completion + small wins

**Goal:** roll the foundation to every pillar; ship low-risk standalone PRDs that unblock later waves.

| PRD                                                              | Parallelism                    | Owner agent                |
| ---------------------------------------------------------------- | ------------------------------ | -------------------------- |
| 153 rollout (media/inventory/cerebrum/core/food/lists contracts) | 6 in parallel                  | `a:contract-<pillar>` × 6  |
| 155 manifest gen rollout                                         | follows 153                    | `a:manifest-gen-rollout`   |
| 158 bootstrap rollout (each pillar)                              | follows their 153              | `a:bootstrap-<pillar>` × 6 |
| 163 subscription model (SSE)                                     | independent                    | `a:subscriptions`          |
| 164 reconciliation on restart                                    | follows 162                    | `a:reconciliation`         |
| 193 React hooks                                                  | follows 191                    | `a:react-hooks`            |
| 194 caching + invalidation                                       | follows 193                    | `a:cache-invalidation`     |
| 195 type generation pipeline                                     | follows 191                    | `a:type-pipeline`          |
| 219 docs container (Stoplight)                                   | independent                    | `a:docs-container`         |
| 08a-203 directory move + namespace rename                        | independent (Theme 12 cleanup) | `a:reclaim-finance`        |
| 08a-204 shell call-site migration                                | follows 203                    | `a:shell-rename`           |
| 08a-205 MCP+CLI call-site migration                              | follows 203                    | `a:cli-rename`             |
| 08a-206 dispatcher + legacy mount delete                         | follows 204+205                | `a:dispatcher-cleanup`     |

**Wave 2 exit criteria:**

- Every pillar has a `@pops/<pillar>-contract` package + a working bootstrap
- Semver CI blocks breaking changes; affected-package rebuild lights up dependents
- SSE subscription + reconciliation tested via fault injection (kill core-api mid-stream; verify clean recovery)
- Epic 08a fully shipped: `core.tagRules` + `core.corrections` namespaces gone; finance-api genuinely self-contained
- Docs container deployed (browsable at `/docs/`)

**Wave 2 duration:** 4 weeks. ~14 parallel agents at peak.

### Wave 3 — Data migrations + batching

**Goal:** finish the cutovers. End of this wave, every table is per-pillar; legacy mounts on pops-api can be deleted.

| PRD                                                                         | Parallelism                                  | Owner agent                   |
| --------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------- |
| 165 media.movies                                                            | independent                                  | `a:cutover-movies`            |
| 166 media.tvShows                                                           | independent                                  | `a:cutover-tv-shows`          |
| 167-172 (media: watchlist, watchHistory, library, discovery, arr, plex)     | 6 in parallel                                | `a:cutover-media-<slice>` × 6 |
| 173 inventory.items                                                         | independent                                  | `a:cutover-items`             |
| 174-178 (inventory: reports, connections, documents, paperless, warranties) | 5 in parallel (gated on 173 where FKs exist) | `a:cutover-inv-<slice>` × 5   |
| 179 cerebrum.engrams                                                        | independent                                  | `a:cutover-engrams`           |
| 180-182 (cerebrum: plexus, glia, conversations)                             | 3 in parallel                                | `a:cutover-cere-<slice>` × 3  |
| 183 core.settings                                                           | independent                                  | `a:cutover-settings`          |
| 184 core.tagRules cleanup                                                   | follows Epic 08a (Wave 2)                    | `a:cleanup-tag-rules`         |
| 185 core.corrections cleanup                                                | follows Epic 08a (Wave 2)                    | `a:cleanup-corrections`       |
| 186 core.aiUsage                                                            | independent                                  | `a:cutover-ai-usage`          |
| 187 splitLink strategy                                                      | independent                                  | `a:splitlink`                 |
| 188 batching invariants                                                     | follows 187                                  | `a:batching-invariants`       |
| 189 batch call-site audit                                                   | follows 187                                  | `a:batch-audit`               |
| 190 nginx dispatcher simplification                                         | follows 187                                  | `a:nginx-cleanup`             |

**Wave 3 exit criteria:**

- Every slice's PR 3 (cutover) is on main; reads + writes land on the per-pillar DB
- 22 of 22 slice PRDs have at least PR 1+2 merged; PR 3+4 can lag (deferred per slice)
- `httpBatchLink` → `splitLink` cutover proven on the shell; legacy regex rules retired
- Schema-coverage CI (Theme 12's #2917) is green across all pillars with the affected-rebuild safety net

**Wave 3 duration:** 6 weeks. Peak parallelism: 20-30 agents. Slice PRDs run in parallel and merge in batches.

### Wave 4 — Cross-cutting orchestrators + FE

**Goal:** repartition load-bearing cross-pillar code; FE registry-aware end-to-end.

| PRD                                | Parallelism                     | Owner agent                     |
| ---------------------------------- | ------------------------------- | ------------------------------- |
| 196 search adapter manifest        | follows Wave 2 (registry alive) | `a:search-manifest`             |
| 197 federated query orchestrator   | follows 196                     | `a:search-orchestrator`         |
| 198 ranking strategy               | follows 197                     | `a:ranking`                     |
| 199 partial failure semantics      | follows 197                     | `a:partial-failure`             |
| 200 AI tool manifest               | follows Wave 2                  | `a:ai-manifest`                 |
| 201 dynamic tool list              | follows 200                     | `a:dynamic-tools`               |
| 202 tool call routing              | follows 201                     | `a:tool-routing`                |
| 207 ADR-029 decision matrix        | follows Wave 3                  | `a:adr-029`                     |
| 208 search orchestrator relocation | follows 207 + 197               | `a:search-api-container`        |
| 209 AI orchestrator relocation     | follows 207 + 202               | `a:ai-api-container`            |
| 210 worker partitioning audit      | follows 207 + Wave 3            | `a:worker-audit`                |
| 211 URI dispatcher relocation      | follows 207                     | `a:uri-dispatcher`              |
| 215 React SDK                      | follows Wave 2                  | `a:react-sdk`                   |
| 216 PillarGuard rewrite            | follows 215                     | `a:pillar-guard`                |
| 217 nginx config generator         | follows Wave 3                  | `a:nginx-gen`                   |
| 218 module-registry deprecation    | follows 215                     | `a:module-registry-deprecation` |

**Wave 4 exit criteria:**

- ADR-029 ratified
- `pops-search-api` + `pops-ai-api` containers deployed on capivara, healthy
- Worker writes go through the SDK (no in-process drizzle imports from sibling pillars)
- PillarGuard reads live registry; stopping a pillar container → unavailable placeholder appears within 30s
- nginx config generated from registry; no hand-maintained dispatcher rules

**Wave 4 duration:** 5 weeks. Peak parallelism: ~12 agents.

### Wave 5 — Drop pops.db + cleanup

**Goal:** the finish line.

| PRD                      | Parallelism | Owner agent         |
| ------------------------ | ----------- | ------------------- |
| 212 readiness audit      | first       | `a:readiness-audit` |
| 213 final drop migration | follows 212 | `a:drop-migration`  |
| 214 code retirement      | follows 213 | `a:code-retirement` |

**Wave 5 exit criteria:**

- `pops.db` no longer mounted on any container
- `apps/pops-api/src/db.ts` deleted (no more `getDb()` / `getDrizzle()`)
- Theme 13 acceptance criteria from the README all green
- Final roadmap reconciliation

**Wave 5 duration:** 2 weeks.

---

## Total timeline

| Wave                              | Duration  | Cumulative |
| --------------------------------- | --------- | ---------- |
| 1 — Foundation (finance pilot)    | 6-8 weeks | 8 weeks    |
| 2 — Foundation rollout + Epic 08a | 4 weeks   | 12 weeks   |
| 3 — Data migrations + batching    | 6 weeks   | 18 weeks   |
| 4 — Cross-cutting + FE            | 5 weeks   | 23 weeks   |
| 5 — Drop pops.db                  | 2 weeks   | 25 weeks   |

**~6 months with full parallel agent budget.** Compresses to 4-5 months if Wave 3 slice migrations run as a 30-agent fleet against the now-rehearsed pattern from Theme 12.

---

## Quality gates between waves

Each gate must hold before the next wave starts. **Don't paper over a failed gate; fix it.**

### Gate 1 → 2 (after finance pilot ships)

- [ ] `pillar('finance').wishlist.list({})` returns typed result from pops-shell
- [ ] Killing pops-finance-api → `lookupPillar('finance')` returns `unavailable` within 30s
- [ ] Restarting pops-finance-api → status flips back to `healthy` within heartbeat interval
- [ ] Contract semver CI catches a synthetic breaking change (positive test)
- [ ] Import discipline lint blocks an attempted `@pops/finance-db` import from outside finance-api
- [ ] Manifest validator rejects a malformed payload at both pillar boot AND registry POST
- [ ] Subscription event fires on register → received by a test subscriber within 100ms
- [ ] Bootstrap helper survives core-api restart (reconciliation works)

### Gate 2 → 3 (after foundation rollout + Epic 08a)

- [ ] Every pillar (7 of them) registers cleanly on boot
- [ ] `core.tagRules.*` and `core.corrections.*` namespaces return 404 (removed)
- [ ] `finance.tagRules.*` and `finance.corrections.*` work
- [ ] Docs container shows all 7 contracts in Stoplight Elements
- [ ] React hooks work in pops-shell with cache invalidation on subscription events
- [ ] Type generation pipeline produces working contract types for at least 2 consuming apps
- [ ] No `@pops/<pillar>-db` imports from non-owning code (baseline empty)

### Gate 3 → 4 (after data migrations + batching)

- [ ] All 22 slice cutover PRs (PR 3 of each) merged
- [ ] Schema-coverage CI passes for every pillar
- [ ] Every shell page loads via `splitLink` (no cross-pillar batched URLs in prod)
- [ ] Legacy nginx regex rules deleted from `apps/pops-shell/nginx.conf`
- [ ] pops-api still serves cross-pillar orchestration code (search, AI, worker) — that's expected; Wave 4's job
- [ ] Per-pillar smoke harness (Theme 12 PRD-2920) passes against every pillar

### Gate 4 → 5 (after cross-cutting + FE)

- [ ] `pops-search-api` and `pops-ai-api` containers healthy on capivara
- [ ] Federated search returns merged results from ≥3 pillars; partial-failure surface shows when one is down
- [ ] AI tool list dynamically reflects registered pillars
- [ ] PillarGuard renders unavailable placeholder when a pillar is stopped; route stays usable when pillar restarts
- [ ] nginx config generated from registry on image build; no hand-maintained per-pillar dispatcher rules
- [ ] Worker no longer imports `@pops/<pillar>-db` from sibling pillars (uses SDK)

### Gate 5 (theme complete)

- [ ] `pops.db` not mounted on any container
- [ ] `apps/pops-api/src/db.ts` exports retired
- [ ] Backfill code retired
- [ ] Every acceptance criterion in the [theme README](README.md#success-criteria) is checked

---

## Agent topology

How to allocate the parallel agent budget.

### Peak parallelism per wave

| Wave | Peak agents | Notes                                       |
| ---- | ----------- | ------------------------------------------- |
| 1    | 10          | Critical path → some serial ordering needed |
| 2    | 14          | Foundation rollout in parallel              |
| 3    | 20-30       | Slice migrations are highly parallel        |
| 4    | 12          | Wave gated on E08a + ADR-029                |
| 5    | 3           | Sequential                                  |

### Agent role taxonomy

- **`a:scaffold-<pillar>`** — owns contract package scaffold + pilot work for ONE pillar
- **`a:cutover-<slice>`** — owns one slice's 4-PR N-track sequence
- **`a:rollout-<pillar>`** — applies an established pattern across pillars
- **`a:cross-cutting`** — handles cross-cutting concerns (search, AI, registry, nginx)
- **`a:cleanup`** — handles deletion / retirement work
- **`a:audit`** — codebase grep + report; non-coding work

### Discipline

- **One agent owns one PRD's PR 1 at a time.** Don't fan-out within a PRD; fan out across PRDs.
- **Slice migrations follow a strict per-PR-author rule.** Slice X's PR 1 author also does PRs 2-4 unless they hand off explicitly. Continuity reduces context-loss.
- **Agents that idle on CI for >10 minutes get killed by the harness watchdog.** Pattern from Theme 12: push code, exit; orchestrator merges.
- **Concurrent agents capped at ~16 per workflow** (turbo's affected-rebuild + CI capacity).

---

## Risk register

What could go wrong, in priority order.

### Risk 1 — Foundation churn

Critical-path PRDs (153, 157, 161, 158, 191) get amended after Wave 1's pilot finds issues. Downstream PRDs (in Waves 2-4) build against an unstable foundation.

**Mitigation:** Strict Gate 1 → 2 criteria. Don't start Wave 2 until the finance pilot is genuinely working end-to-end. Treat post-pilot amendments as new PRDs, not edits to merged ones.

### Risk 2 — Contract semver discipline drift

Authors bump version without thinking; CI doesn't catch it; consumers ship against a moved-on contract.

**Mitigation:** PRD-154's affected-rebuild + the synthetic-mismatch self-test catch most cases. Hold the line on "no `--admin` merges on contract bumps."

### Risk 3 — Wave 3 slice migrations blocked on each other

Slice X's PR 3 depends on slice Y's PR 1; Y's author hasn't started. Idle agents.

**Mitigation:** Dependency table in the [full checklist](#full-prd-checklist) below. Wave 3 kickoff includes explicit slice-to-agent assignment.

### Risk 4 — Cross-pillar tag-suggester migration discovers unforeseen entanglement

Epic 08a's PRD-203 directory move surfaces hidden consumers in non-finance code.

**Mitigation:** The PRD calls out an audit step; treat surprises as "stop and report," not "fix in place."

### Risk 5 — `pops.db` drop reveals undocumented references

Wave 5's PRD-213 deletes tables; something in the worker still grep-references the schema; runtime crash.

**Mitigation:** PRD-212 (readiness audit) gates 213. If audit finds anything, add a per-table PRD (sibling to E03) before drop.

### Risk 6 — Production deploy lag

Watchtower is on a daily cadence (04:00 AEST). A breaking change that ships at midnight has a 4-hour exposure window.

**Mitigation:** Sequence breaking changes to land just after a Watchtower fire. Theme 12 already established this discipline.

### Risk 7 — Contract version-skew in production

Pillar A is built against `@pops/finance-contract@1.4`; consumer is built against `1.5`. At runtime, optional fields trip.

**Mitigation:** ADR-031's runtime safety net (SDK returns `{ kind: 'contract-mismatch' }`). PRD-159's discovery cache exposes contract versions per pillar so consumers can verify.

### Risk 8 — Wave 4 agentic complexity

`pops-search-api` + `pops-ai-api` are new containers. Compose, secrets, networking, Litestream — operational overhead.

**Mitigation:** Wave 4 starts with the homelab-infra compose update; deploy the empty containers first; populate code in subsequent PRs. Same pattern as the overnight pillar-container deployment.

---

## Full PRD checklist

Status legend: ⏳ Not started · 🔄 In progress · ✅ Done · ⛔ Blocked

| PRD     | Slug                             | Wave | Status | Requires               | Unblocks                       |
| ------- | -------------------------------- | ---- | ------ | ---------------------- | ------------------------------ |
| 153     | contract-package-scaffold        | 1    | ⏳     | ADR-030                | 154, 155, 156, 157, all others |
| 154     | contract-semver-ci               | 1    | ⏳     | 153                    | gates breaking changes         |
| 155     | manifest-type-generation         | 1    | ⏳     | 153                    | 157, 158                       |
| 156     | consumer-import-discipline       | 1    | ⏳     | 153                    | enforces boundaries            |
| 157     | manifest-schema-validator        | 1    | ⏳     | 155                    | 158, 161                       |
| 158     | bootstrap-pillar-helper          | 1    | ⏳     | 157                    | every pillar's boot            |
| 159     | discovery-client                 | 1    | ⏳     | 161                    | 191, 215                       |
| 160     | capability-projection-types      | 1    | ⏳     | 153                    | 191                            |
| 161     | registry-schema-endpoints        | 1    | ⏳     | 157, ADR-027           | 158, 159, 162, 163             |
| 162     | heartbeat-lifecycle              | 1    | ⏳     | 161                    | 163                            |
| 163     | subscription-model               | 1    | ⏳     | 161, 162               | 194                            |
| 164     | reconciliation-on-restart        | 2    | ⏳     | 162                    | core-api restart resilience    |
| 165     | media-movies-cutover             | 3    | ⏳     | Wave 2                 | (canonical pattern)            |
| 166-186 | (slice cutovers)                 | 3    | ⏳     | 165 (pattern) + Wave 2 | Wave 4                         |
| 187     | splitlink-strategy               | 3    | ⏳     | ADR-028                | 188, 189, 190                  |
| 188     | batching-invariants              | 3    | ⏳     | 187                    | regression prevention          |
| 189     | batch-call-site-audit            | 3    | ⏳     | 187                    | 206, 208                       |
| 190     | nginx-dispatcher-simplification  | 3    | ⏳     | 187                    | 217                            |
| 191     | client-surface                   | 1    | ⏳     | 159, 160               | 192, 193, 215                  |
| 192     | server-surface                   | 1    | ⏳     | 191                    | 197, 209, 210                  |
| 193     | react-hooks                      | 2    | ⏳     | 191                    | 194, 215                       |
| 194     | caching-invalidation             | 2    | ⏳     | 193, 163               | 215                            |
| 195     | type-generation-pipeline         | 2    | ⏳     | 191                    | consumer ergonomics            |
| 196     | search-adapter-manifest          | 4    | ⏳     | Wave 2                 | 197                            |
| 197     | federated-query-orchestrator     | 4    | ⏳     | 196, 192               | 198, 199, 208                  |
| 198     | ranking-strategy                 | 4    | ⏳     | 197                    | 199                            |
| 199     | partial-failure-semantics        | 4    | ⏳     | 197                    | search UX                      |
| 200     | ai-tool-manifest                 | 4    | ⏳     | Wave 2                 | 201                            |
| 201     | dynamic-tool-list                | 4    | ⏳     | 200                    | 202                            |
| 202     | tool-call-routing                | 4    | ⏳     | 201                    | 209                            |
| 203     | directory-move-namespace-rename  | 2    | ⏳     | independent            | 204, 205, 206                  |
| 204     | shell-call-site-migration        | 2    | ⏳     | 203                    | 206                            |
| 205     | mcp-cli-call-site-migration      | 2    | ⏳     | 203                    | 206                            |
| 206     | dispatcher-legacy-mount-deletion | 2    | ⏳     | 204, 205               | 184, 185                       |
| 207     | adr-029-decision-matrix          | 4    | ⏳     | Wave 3                 | 208, 209, 210, 211             |
| 208     | search-orchestrator-relocation   | 4    | ⏳     | 207, 197               | search-api container           |
| 209     | ai-orchestrator-relocation       | 4    | ⏳     | 207, 202               | ai-api container               |
| 210     | worker-partitioning-audit        | 4    | ⏳     | 207, Wave 3            | worker isolation               |
| 211     | uri-dispatcher-relocation        | 4    | ⏳     | 207                    | URI handling                   |
| 212     | readiness-audit                  | 5    | ⏳     | Wave 4                 | 213                            |
| 213     | final-drop-migration             | 5    | ⏳     | 212                    | 214                            |
| 214     | code-retirement                  | 5    | ⏳     | 213                    | theme complete                 |
| 215     | react-sdk                        | 4    | ⏳     | 193, 194               | 216, 218                       |
| 216     | pillar-guard-rewrite             | 4    | ⏳     | 215                    | FE graceful degradation        |
| 217     | nginx-config-generator           | 4    | ⏳     | 190                    | dispatcher automation          |
| 218     | module-registry-deprecation      | 4    | ⏳     | 215                    | legacy retirement              |
| 219     | docs-swagger-container           | 2    | ⏳     | 153                    | dev ergonomics                 |
| 184     | core-tag-rules-cleanup           | 3    | ⏳     | 206                    | core cleanup                   |
| 185     | core-corrections-cleanup         | 3    | ⏳     | 206                    | core cleanup                   |

---

## Recommendations

### Hold the foundation tight

Don't run E03 (slice migrations) in parallel with E01/E02 (foundation). The pattern from Theme 12 worked because the pattern was _known_ — for Theme 13, the pattern doesn't exist yet. Wave 1 must establish it.

### Ship Epic 08a in Wave 2, not later

Reclaiming the misnamed finance code is mechanical and unblocks E03's cleanup PRDs (184, 185). Land it early; cleaner baseline for everything downstream.

### Reuse Theme 12's CI patterns

- Per-pillar smoke harness (PRD-2920) → expand to test every contract's pillar() roundtrip
- Schema-coverage CI (PRD-2917) → extend to validate per-pillar baseline migrations exist
- Drift-guard pattern (Track L) → reuse for contract package drift detection

### Run the slice migrations as a fleet

Wave 3 is the highest parallel surface. 20-30 agents picking up slice PRDs simultaneously. The pattern from the overnight session (Theme 12's N-track) showed this works at this scale.

### Stage the cross-cutting work

Wave 4's E08b (cross-pillar code placement) is the hardest architectural decision in the theme. Don't conflate it with the parallel slice migrations. Run them sequentially:

- Wave 3 → all slices migrate (data layer per-pillar everywhere)
- THEN write ADR-029
- THEN ship E08b

### Treat ADRs as gates, not artifacts

ADRs 027-031 sit "Proposed" until ratified. Wave 1 ratifies 027 (registry) + 030 (contracts) + 031 (release cadence). Wave 3 ratifies 028 (batching). Wave 4 ratifies 029 (cross-pillar placement). Don't start the implementation PRDs that depend on an ADR until the ADR is Accepted.

### Watch for "deferral creep"

Theme 12 ended with PR-3-deferred patterns because of `httpBatchLink`. Theme 13's batching fix (E04) should genuinely fix this. If you find yourself deferring slice cutover PR 3s in Wave 3 because of batching, escalate E04 ahead.

### Keep `pops.db` documented during the long migration

Theme 12 finished with documentation that lagged the actual code. For Theme 13, update the schema-coverage CI's report at the end of each wave so "what's left on pops.db" is always visible.

---

## Path from now to fully implemented

1. **Today.** Theme 13 spec is complete. ADRs in Proposed state. Decide which agent will own Wave 1.
2. **Week 1.** Ratify ADRs 027 + 030 + 031. Start PRD-153 (contract scaffold, finance pilot).
3. **Weeks 2-8.** Run Wave 1 against finance. Gate 1 → 2.
4. **Weeks 9-12.** Run Wave 2 (foundation rollout to all 7 pillars + E08a). 14 parallel agents at peak.
5. **Weeks 13-18.** Run Wave 3 (all slice cutovers + batching fix). 20-30 parallel agents.
6. **Weeks 19-23.** Run Wave 4 (search, AI, FE, container splits). 12 parallel agents.
7. **Weeks 24-25.** Run Wave 5 (drop `pops.db`).
8. **End of Wave 5.** Theme 13 marked ✅ in roadmap. Aggregate distance to completion: zero (modulo Q3, which is deferred-by-design from Theme 12).

After Theme 13, the next theme is whatever you decide. Mobile (per the existing roadmap)? Cerebrum agentic features? AI categorisation across more domains? The pillar architecture supports all of them with minimal additional effort.

---

## TL;DR for the impatient

- **5 waves, ~6 months end to end with full parallel agent budget.**
- **Wave 1 is the foundation — don't fan out before it's proven on finance.**
- **Wave 3 is the highest parallel surface — fleet of 20-30 agents on slice migrations.**
- **Each wave has hard quality gates; don't paper over failed gates.**
- **The critical path is PRD-153 → 157 → 161 → 158 → 191 — that's the load-bearing five.**
- **Theme 12's CI patterns + the new contract semver CI together catch ~95% of regressions before merge.**

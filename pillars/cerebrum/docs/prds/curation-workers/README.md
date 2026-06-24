# Curation Workers

> Status: Partial — all four workers compute and propose synchronously over REST; autonomy (background queue, trust-phase execution, query-hit tracking, glia.toml thresholds, link re-pointing) is not built. See [ideas/curation-workers-autonomy](../../ideas/curation-workers-autonomy.md).

Four Glia curation workers keep the engram corpus healthy: **pruner** (staleness + orphan detection), **consolidator** (cluster-and-merge of near-duplicate engrams), **linker** (cross-reference discovery), and **auditor** (quality scoring, contradiction detection, coverage-gap flagging). Each worker scans the cerebrum pillar's own engram store, scores or compares engrams, and returns a uniform set of proposed `GliaAction` records. Workers curate existing content only — they never create or ingest knowledge.

Engrams (and the glia actions these workers feed) live in the cerebrum pillar's own SQLite DB.

## Data Model

### GliaAction (worker output)

Every worker emits actions in one shape, consumed downstream by the trust-graduation domain:

| Field         | Type                                          | Notes                                                                                             |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `id`          | string                                        | `glia_{actionType}_{timestamp}_{shortHash}`                                                       |
| `actionType`  | `prune` \| `consolidate` \| `link` \| `audit` | Which worker produced it                                                                          |
| `affectedIds` | string[]                                      | Engram IDs the action touches                                                                     |
| `rationale`   | string                                        | Human-readable explanation for approve/reject                                                     |
| `payload`     | object                                        | Action-type-specific (archive plan, merge plan, link pair, quality breakdown, contradiction, gap) |
| `phase`       | `propose` \| `act_report` \| `silent`         | Trust phase at creation                                                                           |
| `status`      | `proposed` \| `executed` \| `error`           | `proposed` in propose mode; `error` on failed LLM compare                                         |
| `createdAt`   | string (ISO 8601)                             |                                                                                                   |

The `run*` endpoints return these actions **ephemerally** plus `processed` / `skipped` counts — in propose mode they are not persisted to the actions table.

### Staleness score (pruner)

Weighted 0.0 (fresh) → 1.0 (stale): days since modified (0.3, linear decay capped at 365d), days since referenced (0.3), inbound link count (0.2, inverse, cap 20), query hit count (0.2, inverse, cap 50). A query within the last 7 days zeroes the hit-count contribution. Thresholds are hardcoded defaults: staleness `0.7`, orphan `0.5`, orphan window `90d`.

### Quality score (auditor)

Weighted 0.0 (poor) → 1.0 (high): completeness (0.3 — has title, body > 50 words, ≥1 scope, ≥1 tag), specificity (0.3 — dates/percentages/currency/proper-noun/duration/URL regex hits + `key:value` tag bonus), template fit (0.2 — header count / 5, or neutral 0.5 when no template), link density (0.2 — outbound links / 10). Flag threshold: hardcoded `0.3`.

## REST API Surface

Served under `/glia/*` (sibling to the trust-graduation router, which owns `/glia/actions`, `/glia/trust-state`, `/glia/digest`). Non-identity domain — no per-request auth.

| Endpoint                         | Body / Query                | Response                              |
| -------------------------------- | --------------------------- | ------------------------------------- |
| `POST /glia/workers/prune`       | `{ dryRun?: boolean }`      | `{ actions, processed, skipped }`     |
| `POST /glia/workers/consolidate` | `{ dryRun?: boolean }`      | `{ actions, processed, skipped }`     |
| `POST /glia/workers/link`        | `{ dryRun?: boolean }`      | `{ actions, processed, skipped }`     |
| `POST /glia/workers/audit`       | `{ dryRun?: boolean }`      | `{ actions, processed, skipped }`     |
| `POST /glia/scores/staleness`    | `{ engramId }`              | `{ score, factors }` (404 if missing) |
| `POST /glia/scores/quality`      | `{ engramId }`              | `{ score, factors }` (404 if missing) |
| `GET  /glia/orphans`             | `?limit` (≤200, default 50) | `{ engrams: OrphanEngram[] }`         |

`dryRun` defaults to `true` on every `run*` handler — a bare call never mutates engrams.

## Business Rules

- Every worker first lists `status: active` engrams and **skips** any that are `archived`, `consolidated`, or carry a `.secret.` scope segment (any scope whose dot-split segments include `secret`).
- Glia never operates across top-level scopes: clustering, linking, and contradiction detection are all confined within a shared first scope segment (`work.*` engrams never merge/link/conflict-check against `personal.*`).
- **Pruner**: per-engram staleness score; engrams above the staleness threshold are proposed for archival with a rationale naming the dominant factor. Orphans (zero inbound links AND no query hit inside the orphan window) use the lower orphan threshold.
- **Consolidator**: builds a similarity adjacency over each scope group via the in-pillar hybrid search (`similar`, cosine > 0.85, engram results only), finds connected components of ≥3 via BFS, and splits components > 10 into sub-clusters of ≤10. Each cluster yields a Markdown merge plan that concatenates source bodies under `### From:` headers, appends a `## Sources` section, and carries the union of cluster tags and cluster-internal links.
- **Linker**: candidates are engrams with fewer than 2 outbound links; for each it queries hybrid search for similar engrams (cosine > 0.7), proposes a bidirectional link when the pair shares a top-level scope and no link already exists in either direction, dedupes within a run by sorted-pair key, and caps proposals at 5 per engram. Payload carries `{ sourceId, targetId, reason, similarityScore }` where `reason` names the similarity and shared tags.
- **Auditor** (read-only — never mutates engrams): (1) scores every engram and flags those below threshold with `{ type: 'low_quality', score, factors, suggestions }`; (2) builds same-scope, tag-sharing pairs and sends each to an LLM contradiction detector, flagging conflicts with `{ type: 'contradiction', engramA, engramB, conflictSummary }`; (3) flags coverage gaps `{ type: 'gap', topic, existingCount, relatedEngrams }` for tags appearing on fewer than the minimum number of engrams (default 2).
- The auditor's contradiction detector is an injected LLM port (real Anthropic adapter in production, fake in tests). A failed comparison yields an action with `status: 'error'` rather than crashing the run.

## Edge Cases

| Case                                          | Behaviour                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Merged engram inherits differing tags / links | Union of source tags and of cluster-internal links (cluster IDs excluded) |
| Engram queried within last 7 days             | Query-hit staleness factor resets to 0 for that engram                    |
| Linker proposes an existing link              | Dropped — no action created if a link exists in either direction          |
| Contradiction spans scopes                    | Not flagged — pairs are built per top-level scope only                    |
| Cluster spans 20+ engrams                     | Split into sub-clusters of ≤10                                            |
| LLM contradiction check fails                 | Action recorded with `status: 'error'`                                    |
| Engram has no template                        | Template-fit factor scores 0.5 (neutral)                                  |
| No reference / query-hit data available       | Both staleness factors contribute maximum staleness (no source wired yet) |

## Acceptance Criteria

- [x] `POST /glia/workers/prune` returns staleness-based archival proposals; the pruner combines the four weighted factors and flags engrams above threshold, plus orphans (zero inbound links + outside the query window) at the lower threshold.
- [x] `POST /glia/scores/staleness` returns a single engram's score with its factor breakdown; missing id → 404.
- [x] `POST /glia/workers/consolidate` detects same-scope clusters of ≥3 (cosine > 0.85) via hybrid search, splits clusters > 10, and returns a merge plan preserving each source body and a `## Sources` credit list, with unioned tags/links.
- [x] `POST /glia/workers/link` proposes bidirectional links between same-scope, sufficiently-similar engrams (cosine > 0.7) with no pre-existing link, capped at 5 per engram and de-duplicated within a run.
- [x] `POST /glia/workers/audit` returns low-quality, contradiction (LLM-backed, same-scope tag-sharing pairs), and coverage-gap actions; a failed LLM compare yields `status: 'error'`.
- [x] `POST /glia/scores/quality` returns a single engram's quality score with factor breakdown; missing id → 404.
- [x] Every worker skips `archived` / `consolidated` / `.secret.*` engrams and never crosses top-level scope boundaries.
- [x] `GET /glia/orphans` lists active, non-skipped engrams with zero inbound links, capped at `limit`.
- [x] `dryRun` (default true) forces propose mode; `run*` responses are ephemeral and not persisted in propose mode.

## Out of Scope / Deferred

These are not built — captured in [ideas/curation-workers-autonomy](../../ideas/curation-workers-autonomy.md):

- Background execution on a `pops:glia` BullMQ queue (workers currently run synchronously in the request).
- Trust-phase-driven execution (`act_report` / `silent`) and persistence to the actions table — handlers always run `propose`; the mutate branches in the worker classes are unreachable today.
- `query_hits` / `last_queried_at` reference tracking feeding the staleness model.
- Per-worker thresholds in `glia.toml` (only `[trust.graduation]` is parsed today).
- Re-pointing external inbound links onto the merged engram during consolidation.
- Execution-time `modified_at` re-check guard.
- Auditor nudge emission in non-propose phases.

Trust graduation, the review queue, approvals, and the digest are owned by the trust-graduation domain. Scheduling of worker runs is owned by the Reflex domain.

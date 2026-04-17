# PRD-085: Curation Workers

> Epic: [04 — Glia](../../epics/04-glia.md)
> Status: Not started

## Overview

Build the four Glia curation worker types that maintain engram quality over time: pruner (staleness detection and orphan cleanup), consolidator (merging related engrams), linker (cross-reference discovery), and auditor (contradiction detection and quality scoring). Each worker runs as a BullMQ job and operates within the current trust phase for its action type (propose, act+report, or silent per ADR-021). Workers produce structured action proposals or execute directly depending on their graduated trust level.

## Data Model

### Glia Action

Every worker produces actions in a uniform structure consumed by the trust graduation system (PRD-086):

| Field          | Type     | Description                                                        |
| -------------- | -------- | ------------------------------------------------------------------ |
| `id`           | string   | Unique action ID: `glia_{action_type}_{timestamp}_{short_hash}`    |
| `action_type`  | string   | `prune`, `consolidate`, `link`, `audit`                            |
| `affected_ids` | string[] | Engram IDs affected by this action                                 |
| `rationale`    | string   | Human-readable explanation of why this action is proposed          |
| `payload`      | object   | Action-type-specific data (merge plan, link pairs, quality scores) |
| `phase`        | string   | Trust phase at time of creation: `propose`, `act_report`, `silent` |
| `created_at`   | string   | ISO 8601 timestamp                                                 |

### Staleness Score (Pruner)

| Factor                | Weight | Measurement                                                              |
| --------------------- | ------ | ------------------------------------------------------------------------ |
| Days since modified   | 0.3    | Linear decay, capped at 365 days                                         |
| Days since referenced | 0.3    | Last time another engram linked to it or Thalamus returned it in a query |
| Inbound link count    | 0.2    | Inverse — more links = lower staleness                                   |
| Query hit count       | 0.2    | Inverse — more retrieval hits = lower staleness                          |

Score range: 0.0 (fresh) to 1.0 (stale). Configurable threshold in `glia.toml` (default: 0.7).

### Quality Score (Auditor)

| Factor       | Weight | Measurement                                              |
| ------------ | ------ | -------------------------------------------------------- |
| Completeness | 0.3    | Has title, body > 50 words, at least one scope, tags > 0 |
| Specificity  | 0.3    | Named entities, concrete details vs vague language       |
| Template fit | 0.2    | Percentage of template-suggested sections present        |
| Link density | 0.2    | Cross-references to other engrams                        |

Score range: 0.0 (poor) to 1.0 (high quality). Threshold for flagging in `glia.toml` (default: 0.3).

## API Surface

| Procedure                         | Input            | Output                               | Notes                                                    |
| --------------------------------- | ---------------- | ------------------------------------ | -------------------------------------------------------- |
| `cerebrum.glia.runPruner`         | dryRun?: boolean | `{ actions: GliaAction[] }`          | Run pruner scan, return proposals or execute             |
| `cerebrum.glia.runConsolidator`   | dryRun?: boolean | `{ actions: GliaAction[] }`          | Run consolidation scan, return proposals or execute      |
| `cerebrum.glia.runLinker`         | dryRun?: boolean | `{ actions: GliaAction[] }`          | Run link scan, return proposals or execute               |
| `cerebrum.glia.runAuditor`        | dryRun?: boolean | `{ actions: GliaAction[] }`          | Run audit scan, return proposals or execute              |
| `cerebrum.glia.getStalenessScore` | engramId: string | `{ score: number, factors: object }` | Single engram staleness score breakdown                  |
| `cerebrum.glia.getQualityScore`   | engramId: string | `{ score: number, factors: object }` | Single engram quality score breakdown                    |
| `cerebrum.glia.getOrphans`        | limit?: number   | `{ engrams: Engram[] }`              | List engrams with no inbound links and no recent queries |

## Business Rules

- All four workers run as BullMQ jobs on the `pops:glia` queue with separate job names (`glia:prune`, `glia:consolidate`, `glia:link`, `glia:audit`)
- Workers check the current trust phase for their action type before executing — in `propose` phase, actions are written to the `glia_actions` table (PRD-086) without execution; in `act_report` phase, actions execute immediately and are logged; in `silent` phase, actions execute and are logged without notification
- The pruner scans all `status: active` engrams, computes a staleness score, and proposes archival for any engram exceeding the staleness threshold. Orphan detection (zero inbound links + zero query hits in the last 90 days) is a separate check with a lower staleness threshold (0.5)
- The consolidator queries Thalamus for clusters of 3+ engrams with cosine similarity above 0.85 within the same top-level scope. It produces a merge plan: a curated document that preserves key content from all cluster members, with originals moved to `.archive/`
- The linker scans engrams that have fewer than 2 outbound links, queries Thalamus for semantically related engrams, checks for shared entities (tags, people, project names), and proposes bidirectional links between engrams with strong overlap
- The auditor runs contradiction detection by comparing engrams that share tags or scopes and contain opposing claims (detected via LLM comparison). It also produces quality scores and flags engrams below the quality threshold
- Glia never operates across top-level scopes — `work.*` engrams are never consolidated with `personal.*` engrams regardless of similarity
- Glia never touches engrams with a `.secret.` scope segment
- All workers skip engrams with `status: archived` or `status: consolidated`
- The `dryRun` parameter forces `propose` mode regardless of the current trust phase — useful for previewing what a worker would do

## Edge Cases

| Case                                              | Behaviour                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| Consolidation merges engrams with different tags  | Merged engram receives the union of all tags from source engrams            |
| Consolidation merges engrams with different links | Merged engram receives the union of all links, re-pointed to the new engram |
| Pruner flags an engram that was recently queried  | Query hits within the last 7 days reset the staleness score for that factor |
| Linker proposes a link that already exists        | Duplicate link proposals are silently dropped                               |
| Auditor finds contradictions across scopes        | Contradictions only flagged within the same top-level scope                 |
| Consolidator cluster spans 20+ engrams            | Cluster is split into sub-clusters of max 10 for manageable merge plans     |
| Engram modified between scan and execution        | Worker re-checks `modified_at` before execution — aborts if changed         |
| LLM call fails during auditor contradiction check | Action logged with `status: error`, retried on next run                     |
| All engrams in a consolidation cluster are stale  | Consolidation proceeds — staleness of originals does not block merging      |
| Quality score for engram with no template         | Template fit factor scores 0.5 (neutral) — no penalty, no bonus             |

## User Stories

| #   | Story                                       | Summary                                                                          | Status      | Parallelisable |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------- | ----------- | -------------- |
| 01  | [us-01-pruner](us-01-pruner.md)             | Staleness scoring, orphan detection, archive proposals                           | Not started | Yes            |
| 02  | [us-02-consolidator](us-02-consolidator.md) | Cluster detection via Thalamus, merge plan generation, archive originals         | Not started | Yes            |
| 03  | [us-03-linker](us-03-linker.md)             | Cross-reference discovery, shared entity detection, bidirectional link proposals | Not started | Yes            |
| 04  | [us-04-auditor](us-04-auditor.md)           | Contradiction detection, quality scoring, coverage gap flagging                  | Not started | Yes            |

All four workers are independent and can be built in parallel. Each worker depends on PRD-077 (engram storage), PRD-079 (Thalamus indexing), and the `glia_actions` table from PRD-086 for dispatching actions through the trust system.

## Verification

- The pruner identifies engrams untouched for 90+ days with no inbound links and proposes archival
- The consolidator detects 3 engrams about the same topic and produces a merge plan that preserves key content
- The linker discovers two engrams sharing the same project tag with no cross-link and proposes a bidirectional link
- The auditor flags two engrams in the same scope with contradicting claims and provides a rationale
- Quality scores correctly penalise engrams with missing titles, no tags, and sparse content
- All workers respect scope boundaries — no cross-scope consolidation or contradiction detection
- Workers in `propose` phase write actions to the `glia_actions` table without modifying engrams
- Workers in `act_report` phase execute the action and log it
- `dryRun: true` always returns proposals without execution regardless of trust phase
- Workers skip `.secret.*` scoped engrams entirely

## Out of Scope

- Trust graduation logic and approval tracking (PRD-086)
- Review queue UI and notification delivery (PRD-086)
- Content creation or ingestion (Glia curates existing content only)
- Curation during the ingest pipeline (Glia runs asynchronously)
- Cross-scope operations (never — regardless of trust level)
- Scheduling of worker runs (PRD-089 — Reflex System handles cron triggers)

## Drift Check

last checked: 2026-04-17

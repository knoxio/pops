# PRD-084: Proactive Nudges

> Epic: [03 — Emit](../../epics/03-emit.md)
> Status: In progress

## Overview

Define the proactive nudge system that surfaces system-initiated suggestions without user prompting. Nudges detect patterns, propose consolidation of similar engrams, alert on staleness, and identify emerging themes or contradictions across the knowledge base. This is the "Output > Input" differentiator — the system produces value beyond what the user explicitly asks for. Nudges are lightweight, actionable, and not noisy.

## Data Model

### Nudge

| Field       | Type        | Required | Description                                                    |
| ----------- | ----------- | -------- | -------------------------------------------------------------- |
| `id`        | string      | Yes      | Unique identifier: `nudge_{YYYYMMDD}_{HHmm}_{type}_{slug}`     |
| `type`      | string      | Yes      | Nudge type: `consolidation`, `staleness`, `pattern`, `insight` |
| `title`     | string      | Yes      | Short summary (max 100 characters)                             |
| `body`      | string      | Yes      | Description with context and suggested action                  |
| `engramIds` | string[]    | Yes      | IDs of engrams involved in this nudge                          |
| `priority`  | string      | Yes      | `low`, `medium`, `high` — determines delivery urgency          |
| `status`    | string      | Yes      | `pending`, `dismissed`, `acted`, `expired`                     |
| `createdAt` | string      | Yes      | ISO 8601 timestamp                                             |
| `expiresAt` | string      | No       | ISO 8601 timestamp — nudge auto-expires if not acted on        |
| `action`    | NudgeAction | No       | Suggested action the user can trigger                          |

### NudgeAction

| Field    | Type   | Description                                                 |
| -------- | ------ | ----------------------------------------------------------- |
| `type`   | string | Action type: `consolidate`, `archive`, `review`, `link`     |
| `label`  | string | Human-readable action label (e.g., "Merge these 3 engrams") |
| `params` | object | Parameters for the action (e.g., `{ engramIds: [...] }`)    |

### SQLite Table (nudge_log)

| Column        | Type | Constraints | Description                        |
| ------------- | ---- | ----------- | ---------------------------------- |
| id            | TEXT | PK          | Nudge ID                           |
| type          | TEXT | NOT NULL    | Nudge type                         |
| title         | TEXT | NOT NULL    | Short summary                      |
| body          | TEXT | NOT NULL    | Full description                   |
| engram_ids    | TEXT | NOT NULL    | JSON array of engram IDs           |
| priority      | TEXT | NOT NULL    | low, medium, high                  |
| status        | TEXT | NOT NULL    | pending, dismissed, acted, expired |
| created_at    | TEXT | NOT NULL    | ISO 8601                           |
| expires_at    | TEXT |             | ISO 8601                           |
| acted_at      | TEXT |             | ISO 8601 — when the user acted     |
| action_type   | TEXT |             | consolidate, archive, review, link |
| action_params | TEXT |             | JSON action parameters             |

**Indexes:** `type`, `status`, `priority`, `created_at`

## API Surface

| Procedure                        | Input                                      | Output                                       | Notes                                                                        |
| -------------------------------- | ------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------- |
| `cerebrum.nudges.list`           | type?, status?, priority?, limit?, offset? | `{ nudges: Nudge[], total: number }`         | List nudges with optional filters                                            |
| `cerebrum.nudges.get`            | id                                         | `{ nudge: Nudge }`                           | Get a specific nudge with full context                                       |
| `cerebrum.nudges.dismiss`        | id                                         | `{ success: boolean }`                       | Mark nudge as dismissed — it will not resurface                              |
| `cerebrum.nudges.act`            | id                                         | `{ result: ActionResult }`                   | Execute the nudge's suggested action                                         |
| `cerebrum.nudges.scan`           | type?: string                              | `{ created: number }`                        | Trigger an on-demand nudge scan (normally runs on schedule)                  |
| `cerebrum.nudges.contradictions` | status?, limit?, offset?                   | `{ contradictions: Contradiction[], total }` | Paginated list of contradiction-type pattern nudges with structured excerpts |
| `cerebrum.nudges.configure`      | thresholds: NudgeThresholds                | `{ success: boolean }`                       | Update detection thresholds                                                  |

### Contradiction (US-03)

Surfaced by `cerebrum.nudges.contradictions`. Each row carries both source engram IDs plus a short verbatim excerpt from each side and the LLM-generated conflict summary, so a reader can assess the conflict without opening either source engram. The status filter defaults to `pending`; pass `null` to include dismissed/acted/expired rows. `total` reflects the filtered count so pagination is honest.

| Field       | Type   | Description                                                          |
| ----------- | ------ | -------------------------------------------------------------------- |
| `id`        | string | Nudge ID this contradiction is derived from                          |
| `createdAt` | string | ISO 8601 timestamp                                                   |
| `status`    | string | `pending`, `dismissed`, `acted`, `expired`                           |
| `priority`  | string | `low`, `medium`, `high` — contradiction nudges are emitted at `high` |
| `title`     | string | Short summary (max 100 characters)                                   |
| `engramA`   | string | ID of the first engram in the contradicting pair                     |
| `engramB`   | string | ID of the second engram in the contradicting pair                    |
| `excerptA`  | string | Verbatim excerpt from engram A (≤ 240 chars, no ellipsis padding)    |
| `excerptB`  | string | Verbatim excerpt from engram B (≤ 240 chars, no ellipsis padding)    |
| `conflict`  | string | One-sentence LLM-generated description of the conflict               |

### NudgeThresholds (configurable)

| Threshold                 | Default | Description                                                        |
| ------------------------- | ------- | ------------------------------------------------------------------ |
| `consolidationSimilarity` | 0.85    | Minimum Thalamus similarity score to propose consolidation         |
| `consolidationMinCluster` | 3       | Minimum cluster size to trigger a consolidation nudge              |
| `stalenessDays`           | 90      | Days without reference or modification before staleness alert      |
| `patternMinOccurrences`   | 5       | Minimum occurrences of a topic before it is flagged as a pattern   |
| `maxPendingNudges`        | 20      | Maximum pending nudges — oldest are expired when exceeded          |
| `nudgeCooldownHours`      | 24      | Minimum hours between nudges of the same type for the same engrams |

## Business Rules

- Nudges are system-initiated — they are generated by background scans, not by user requests (though `scan` can trigger an on-demand scan)
- Consolidation nudges detect clusters of engrams with high semantic similarity (via Thalamus embedding similarity) and propose merging them into a single curated document
- Staleness nudges flag engrams that have not been referenced (via links or query results) or modified within the configured threshold (default 90 days)
- Pattern nudges detect recurring topics, emerging themes, or contradictions across engrams and surface them as insights (e.g., "You've written about agent coordination 12 times in the last month — consider creating a research summary")
- Nudges respect scope boundaries — a consolidation nudge never proposes merging engrams from different top-level scopes (e.g., `personal.*` and `work.*`)
- Secret-scoped engrams are included in nudge detection (the system sees everything) but nudge descriptions never reveal secret content in their title or body — they reference the engram by ID only
- Each nudge has a cooldown — the same set of engrams cannot trigger the same nudge type within the cooldown period (default 24 hours)
- Pending nudges are capped at `maxPendingNudges` — when exceeded, the oldest pending nudges are expired with `status: expired`
- Dismissing a nudge is permanent — the same nudge will not be regenerated for the same engrams unless the underlying data changes significantly (new content added, similarity score changes)
- Acting on a nudge executes its suggested action (e.g., consolidation creates a new engram and archives the originals) and marks the nudge as `acted`
- Nudges have optional expiry — time-sensitive nudges (e.g., "this meeting note from yesterday has no follow-up actions") auto-expire after their `expiresAt` timestamp
- Delivery channels are shell notifications (pops shell notification system) and Moltbot (Telegram) — nudges are delivered to both by default

## Edge Cases

| Case                                                                       | Behaviour                                                                                                 |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Similarity cluster spans secret and non-secret engrams                     | Consolidation nudge is suppressed — cross-scope-level consolidation is not proposed                       |
| All engrams are stale (new system, no activity)                            | Staleness nudges are suppressed until the system has at least 30 days of activity                         |
| Two nudges propose conflicting actions for the same engram                 | Higher-priority nudge takes precedence; lower-priority is expired                                         |
| User dismisses a consolidation nudge, then a new engram joins the cluster  | New nudge is generated — the cluster changed, so the previous dismissal does not apply                    |
| Scan finds zero nudge-worthy conditions                                    | No nudges created — this is normal and expected                                                           |
| Acting on a consolidation nudge but one source engram was already archived | Action proceeds with remaining engrams — archived engrams are excluded from the merge                     |
| `maxPendingNudges` exceeded                                                | Oldest pending nudges are expired in FIFO order until count is within the limit                           |
| Nudge references an engram that was deleted                                | Nudge is auto-expired — its engram references are stale                                                   |
| Pattern detection finds contradictions                                     | Surfaced as an insight nudge: "These engrams express contradictory positions on X — review and reconcile" |
| Nudge scan runs during active ingestion                                    | Scan operates on committed engrams only — in-flight ingestions are not considered                         |

## User Stories

| #   | Story                                                             | Summary                                                                                   | Status  | Parallelisable |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------- | -------------- |
| 01  | [us-01-consolidation-proposals](us-01-consolidation-proposals.md) | Detect similar engram clusters via Thalamus, propose consolidation into curated documents | Partial | No (first)     |
| 02  | [us-02-staleness-alerts](us-02-staleness-alerts.md)               | Detect engrams not referenced or modified in N days, flag as stale                        | Partial | Yes            |
| 03  | [us-03-pattern-detection](us-03-pattern-detection.md)             | Detect recurring topics, emerging themes, contradictions — surface as insights            | Done    | Yes            |
| 04  | [us-04-notification-delivery](us-04-notification-delivery.md)     | Deliver nudges via shell notifications and Moltbot: lightweight, actionable               | Partial | Yes            |

US-01 establishes the nudge data model, storage, and action framework. US-02 and US-03 are independent detection modes that can parallelise with each other and with US-01 (they produce nudges in the same format). US-04 is the delivery layer and can parallelise with all detection stories.

## Verification

- A cluster of 3+ engrams with similarity > 0.85 triggers a consolidation nudge with a proposed merge action
- An engram not referenced or modified in 90+ days triggers a staleness alert
- A topic mentioned in 5+ engrams within 30 days triggers a pattern detection nudge
- Acting on a consolidation nudge creates a new engram, archives the source engrams, and marks the nudge as `acted`
- Dismissing a nudge permanently suppresses it — the same nudge is not regenerated unless the underlying data changes
- Nudges never reveal secret-scoped content in their title or body
- Consolidation nudges never propose merging engrams from different top-level scopes
- Shell notifications and Moltbot messages are delivered for new nudges
- The nudge cooldown prevents the same engram set from generating duplicate nudges within 24 hours
- Pending nudges exceeding `maxPendingNudges` are expired oldest-first

## Out of Scope

- Automated action execution without user confirmation (Epic 04 — Glia trust graduation enables autonomous curation)
- Nudge-based learning or tuning (future — track which nudges are acted on vs dismissed to improve detection)
- Custom nudge types defined by the user (future — initial system has four fixed types)
- Nudge delivery via email or push notifications (future — initial channels are shell and Moltbot only)
- Nudge aggregation dashboards (future — initial implementation is a flat list)

## Drift Check

last checked: 2026-04-17

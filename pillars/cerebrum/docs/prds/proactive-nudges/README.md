# Proactive Nudges

Status: Partial — detection, persistence, act/dismiss, REST surface, and the in-app nudges UI + shell bell are shipped. Multi-channel delivery (Moltbot/Telegram push, priority scheduling, daily digest, quiet hours, delivery preferences) is not built — see [ideas/nudge-delivery-channels.md](../../ideas/nudge-delivery-channels.md).

System-initiated suggestions surfaced without the user prompting. Background scans detect clusters of similar engrams (propose consolidation), stale engrams (propose review/archive), and recurring/emerging/contradictory patterns across the corpus (surface as insights). Nudges are persisted in the cerebrum pillar's own SQLite DB (`nudge_log`), alongside engrams, plexus, glia, and conversations. This is the "output > input" surface: the pillar produces value beyond what was explicitly asked.

## Data Model

`nudge_log` (cerebrum SQLite):

| Column          | Type | Constraints | Notes                                                    |
| --------------- | ---- | ----------- | -------------------------------------------------------- |
| `id`            | TEXT | PK          | `nudge_{YYYYMMDD}_{HHmm}_{type}_{slug}`                  |
| `type`          | TEXT | NOT NULL    | `consolidation` \| `staleness` \| `pattern` \| `insight` |
| `title`         | TEXT | NOT NULL    | ≤ 100 chars                                              |
| `body`          | TEXT | NOT NULL    | Markdown description + suggested action                  |
| `engram_ids`    | TEXT | NOT NULL    | JSON array of engram IDs                                 |
| `priority`      | TEXT | NOT NULL    | `low` \| `medium` \| `high`                              |
| `status`        | TEXT | NOT NULL    | `pending` \| `dismissed` \| `acted` \| `expired`         |
| `created_at`    | TEXT | NOT NULL    | ISO 8601                                                 |
| `expires_at`    | TEXT |             | ISO 8601 — optional auto-expiry                          |
| `acted_at`      | TEXT |             | ISO 8601 — set when acted                                |
| `action_type`   | TEXT |             | `consolidate` \| `archive` \| `review` \| `link`         |
| `action_label`  | TEXT |             | Human-readable label (e.g. "Merge these 3 engrams")      |
| `action_params` | TEXT |             | JSON action params; contradiction evidence nested here   |

Indexes: `type`, `status`, `priority`, `created_at`.

Detection thresholds are held in-process (defaults below, overridable via `CEREBRUM_NUDGE_*` env vars and the `configure` endpoint). They are **not** persisted across restarts — a deliberate deviation pending a settings store.

| Threshold                 | Default | Meaning                                                      |
| ------------------------- | ------- | ------------------------------------------------------------ |
| `consolidationSimilarity` | 0.85    | Min embedding similarity to cluster engrams                  |
| `consolidationMinCluster` | 3       | Min cluster size to emit a consolidation nudge               |
| `stalenessDays`           | 90      | Days since modification before staleness (citation-adjusted) |
| `patternMinOccurrences`   | 5       | Min topic occurrences to flag a pattern                      |
| `maxPendingNudges`        | 20      | Pending cap — oldest expired FIFO when exceeded              |
| `nudgeCooldownHours`      | 24      | Min hours between same-type/same-engram-set nudges           |

## REST API

All under the cerebrum pillar contract; `list`/`contradictions` are POST-with-body because typed enum filters do not round-trip cleanly through a query string. Served on the docker-network trust boundary with no per-request auth (parity with templates/engrams).

| Endpoint                      | Purpose                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| `POST /nudges`                | Create one alert-driven nudge (no cooldown dedup)                          |
| `POST /nudges/search`         | List nudges by `type`/`status`/`priority` with `limit`/`offset` + `total`  |
| `GET  /nudges/:id`            | Fetch one nudge (404 if absent)                                            |
| `POST /nudges/:id/dismiss`    | Dismiss a pending nudge (404 missing, 409 non-pending)                     |
| `POST /nudges/:id/act`        | Execute the nudge's action and mark `acted` (404 missing, 409 non-pending) |
| `POST /nudges/contradictions` | Paginated contradiction-pattern nudges projected to structured evidence    |
| `POST /nudges/scan`           | Run detectors over the active corpus, persist candidates → `{ created }`   |
| `POST /nudges/configure`      | Patch in-process detection thresholds                                      |

Contradiction projection row: `id`, `createdAt`, `status`, `priority`, `title`, `engramA`, `engramB`, `excerptA` (≤240 chars verbatim), `excerptB` (≤240 chars verbatim), `conflict` (one-sentence LLM summary). Status filter defaults to `pending`; pass `null` to include all statuses. `total` reflects the filtered count (SQL-side `json_extract` predicate keeps non-contradiction pattern rows out of both rows and count).

## Business Rules

- Nudges are detector-produced; `scan` triggers an on-demand pass (otherwise scheduled). Scans operate on committed engrams loaded from the index; in-flight ingestions are not considered.
- **Consolidation**: clusters engrams via embedding similarity (in-pillar hybrid search `similar`) above `consolidationSimilarity`; cluster must reach `consolidationMinCluster`. Clustering never crosses top-level scope boundaries (`personal.*` and `work.*` are never merged). Archived/consolidated engrams are excluded.
- **Staleness**: flags active engrams whose `modified_at` is older than the citation-adjusted `stalenessDays`. Suppressed entirely until the corpus is ≥ 30 days old (oldest engram). Archived/consolidated engrams excluded. Priority scales with age (`>2×` → medium, `>3×` → high).
- **Pattern**: detects recurring topics (tag frequency ≥ `patternMinOccurrences` in a 30-day window), emerging themes (rising trend over a time series), and contradictions (engram pairs sharing tags within one top-level scope, adjudicated by an injectable LLM analyzer — default Anthropic). Recurring/emerging → `medium`; contradictions → `high` and carry both source IDs, verbatim excerpts, and a one-sentence conflict summary embedded in `action_params`.
- Cooldown: a candidate is skipped if a nudge of the same `type` with the same sorted `engramIds` exists within `nudgeCooldownHours`.
- Pending cap: after each scan, the oldest pending rows beyond `maxPendingNudges` are set to `expired` (FIFO).
- Acting executes the action through the in-pillar `EngramService`: `consolidate` synthesizes a merged engram by concatenating source bodies under per-source headings then marks sources `consolidated` (a `BodySynthesizer` seam exists for a future LLM-backed merge — see [ideas/nudge-delivery-channels.md](../../ideas/nudge-delivery-channels.md) — but only the concatenation synthesizer is wired today); `archive` sets sources `archived`; `review` bumps `modified_at`; `link` links the head engram to the rest. The nudge then becomes `acted` with `acted_at` set. If the action throws, the nudge stays `pending`.
- Dismissal is a `pending → dismissed` transition; a dismissed cluster only resurfaces when its composition changes (cooldown keys on the exact engram set).

## Edge Cases

| Case                                               | Behaviour                                                    |
| -------------------------------------------------- | ------------------------------------------------------------ |
| Cluster spans two top-level scopes                 | Not clustered — consolidation never crosses top-level scope  |
| Fresh corpus (< 30 days old)                       | Staleness detection suppressed                               |
| Scan finds nothing                                 | Zero nudges created — normal                                 |
| Consolidation source already archived/consolidated | Excluded from the merge; act proceeds with remaining sources |
| `maxPendingNudges` exceeded                        | Oldest pending expired FIFO until within cap                 |
| Engram body unreadable (deleted/secret/IO)         | Body reader returns null; contradiction pass skips that pair |
| Same engram set within cooldown window             | Duplicate candidate skipped                                  |
| Act on non-pending nudge                           | 409 Conflict                                                 |

## UI

- Cerebrum app **NudgesPage** (`/cerebrum/nudges`) lists pending nudges via `POST /nudges/search`, each rendered as a **NudgeCard** with priority badge, type, body, an Act button (when the nudge carries an action) and Dismiss. A **ContradictionsPanel** lists contradiction-pattern nudges with both excerpts and the conflict summary.
- Shell top-bar **NudgeIndicator** bell polls `POST /nudges/search` (`status: pending, limit: 1`) and badges the pending count. Poll interval uses exponential backoff keyed on consecutive fetch failures: 60s → 2m → 4m → 8m → 16m, stopping after 5 failures and recovering to 60s on the next success. The bell hides entirely while cerebrum is unreachable.

## Acceptance Criteria

- [x] `nudge_log` stores every nudge with type, status, engram references, action, and timestamps; indexed on type/status/priority/created_at.
- [x] A cluster of ≥ `consolidationMinCluster` engrams with mutual similarity > `consolidationSimilarity` produces a `consolidation` nudge with a `consolidate` action; cross-top-level-scope clusters are suppressed.
- [x] Acting on a consolidation nudge synthesizes a merged engram by concatenating source bodies under per-source headings (a `BodySynthesizer` seam exists for a future LLM merge but only concatenation is wired), marks sources `consolidated`, and marks the nudge `acted`.
- [x] An active engram unmodified beyond the citation-adjusted `stalenessDays` produces a `staleness` nudge; archived/consolidated engrams and corpora younger than 30 days are excluded.
- [x] Acting on a staleness nudge dispatches `archive` (sets `archived`) or `review` (bumps `modified_at`) through `EngramService`.
- [x] A topic in ≥ `patternMinOccurrences` engrams within 30 days produces a `pattern` nudge; rising trends are flagged emerging; contradictions are adjudicated by the LLM analyzer and emitted at `high` priority with both excerpts and a conflict summary.
- [x] `POST /nudges/contradictions` returns only contradiction nudges with structured evidence; `total` is the filtered count; status defaults to `pending`, `null` includes all.
- [x] Cooldown prevents the same type + engram set within `nudgeCooldownHours`; pending nudges over `maxPendingNudges` are expired oldest-first.
- [x] `configure` patches in-process thresholds and round-trips with `scan` within the same process (not persisted across restarts).
- [x] Dismiss is a permanent `pending → dismissed`; non-pending dismiss/act return 409, missing returns 404.
- [x] The NudgesPage lists, acts on, and dismisses nudges; the shell bell badges the pending count with failure-backed exponential backoff.

## Out of Scope

- Multi-channel delivery: Moltbot/Telegram push with inline Act/Dismiss/Details buttons, priority-tiered scheduling, daily digest, quiet hours, and per-channel preferences — see [ideas/nudge-delivery-channels.md](../../ideas/nudge-delivery-channels.md).
- Explicit secret-content redaction in nudge titles/bodies — see the delivery idea file; today scope-boundary clustering is the only guard.
- Autonomous action execution without confirmation (covered by glia trust graduation).
- Nudge tuning/learning from act-vs-dismiss signals, user-defined nudge types, and aggregation dashboards.

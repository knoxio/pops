# PRD-089: Reflex System

> Epic: [06 — Reflex](../../epics/06-reflex.md)
> Status: Done

## Overview

Build the event-action automation system that triggers actions in response to engram lifecycle events, threshold conditions, or cron schedules. Reflexes are defined declaratively in `reflexes.toml` as simple trigger-action rules. The system dispatches actions to existing subsystems (Ingest, Emit, Glia) — it defines _when_ things happen, not _what_ happens. After this PRD, Cerebrum operates proactively without requiring user prompts for routine operations.

## Data Model

### Reflex Definition (reflexes.toml)

```toml
[[reflex]]
name = "weekly-summary"
description = "Generate a weekly knowledge summary every Sunday"
enabled = true
trigger = { type = "schedule", cron = "0 8 * * 0" }
action = { type = "emit", verb = "generate", template = "weekly-summary", scopes = ["work.*", "personal.*"] }

[[reflex]]
name = "auto-classify-captures"
description = "Classify new captures after ingestion"
enabled = true
trigger = { type = "event", event = "engram.created", conditions = { type = "capture" } }
action = { type = "ingest", verb = "classify", target = "{{engram_id}}" }

[[reflex]]
name = "consolidation-check"
description = "Propose consolidation when 10+ similar engrams exist on a topic"
enabled = true
trigger = { type = "threshold", metric = "similar_count", value = 10, scopes = ["work.*"] }
action = { type = "glia", verb = "consolidate" }

[[reflex]]
name = "daily-staleness-scan"
description = "Run the pruner daily to detect stale engrams"
enabled = true
trigger = { type = "schedule", cron = "0 6 * * *" }
action = { type = "glia", verb = "prune" }
```

### reflex_executions (SQLite)

| Column       | Type | Constraints | Description                                                |
| ------------ | ---- | ----------- | ---------------------------------------------------------- |
| id           | TEXT | PK          | Execution ID: `rex_{reflex_name}_{timestamp}`              |
| reflex_name  | TEXT | NOT NULL    | Name from reflexes.toml                                    |
| trigger_type | TEXT | NOT NULL    | `event`, `threshold`, `schedule`                           |
| trigger_data | TEXT |             | JSON — event payload, threshold values, or cron expression |
| action_type  | TEXT | NOT NULL    | `ingest`, `emit`, `glia`                                   |
| action_verb  | TEXT | NOT NULL    | Specific action within the type                            |
| status       | TEXT | NOT NULL    | `triggered`, `executing`, `completed`, `failed`            |
| result       | TEXT |             | JSON — action output or error details                      |
| triggered_at | TEXT | NOT NULL    | ISO 8601 — when the trigger fired                          |
| completed_at | TEXT |             | ISO 8601 — when execution finished                         |

**Indexes:** `reflex_name`, `trigger_type`, `status`, `triggered_at`

## API Surface

| Procedure                   | Input                  | Output                                               | Notes                                                     |
| --------------------------- | ---------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| `cerebrum.reflexes.list`    | —                      | `{ reflexes: ReflexDefinition[] }`                   | All reflexes from reflexes.toml with runtime status       |
| `cerebrum.reflexes.get`     | name: string           | `{ reflex: ReflexDefinition, history: Execution[] }` | Single reflex with recent execution history               |
| `cerebrum.reflexes.test`    | name: string           | `{ result: Execution }`                              | Dry-run execution — fires the action without side effects |
| `cerebrum.reflexes.enable`  | name: string           | `{ success: boolean }`                               | Enable a disabled reflex                                  |
| `cerebrum.reflexes.disable` | name: string           | `{ success: boolean }`                               | Disable a reflex (stops scheduling and event listening)   |
| `cerebrum.reflexes.history` | name?, limit?, offset? | `{ executions: Execution[], total }`                 | Execution history, optionally filtered by reflex name     |

## Business Rules

- Reflexes are defined in `engrams/.config/reflexes.toml` — the file is the source of truth. Enabling/disabling via the API updates the `enabled` field in the TOML file
- Three trigger types: `event` (fires on engram lifecycle events), `threshold` (fires when a metric crosses a value), `schedule` (fires on a cron expression)
- Event triggers subscribe to engram lifecycle events via a BullMQ event bus: `engram.created`, `engram.modified`, `engram.archived`, `engram.linked`. The optional `conditions` object filters events by engram fields (type, scopes, source)
- Threshold triggers are evaluated periodically (configurable, default every 30 minutes) by querying Thalamus for metric values: `similar_count` (number of engrams above a similarity threshold on a topic), `staleness_max` (highest staleness score across engrams), `topic_frequency` (number of engrams tagged with a given topic). The optional `scopes` field restricts evaluation to specific scope prefixes
- Scheduled triggers use BullMQ repeatable jobs with cron expressions. They fire at the specified time regardless of system state
- Actions dispatch to existing subsystems: `ingest` actions call ingestion pipeline procedures, `emit` actions call output production procedures, `glia` actions enqueue worker runs. Action payloads support template variables (e.g., `{{engram_id}}` for event-triggered reflexes)
- Each reflex execution is logged in the `reflex_executions` table with full trigger data, action details, and outcome
- Disabled reflexes are ignored by the dispatch loop — they remain in the TOML file but do not fire
- Dry-run (`test`) executes the action with a read-only flag — Glia workers run with `dryRun: true`, Emit generates output without delivering, Ingest previews without writing

## Edge Cases

| Case                                                        | Behaviour                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| reflexes.toml parse error                                   | All reflexes disabled, error logged with line number — system continues without automation    |
| Event trigger for a deleted reflex                          | Event ignored — stale event subscriptions are cleaned up on TOML reload                       |
| Threshold crossed multiple times between checks             | Only one execution per check cycle — threshold triggers are edge-detected, not level-detected |
| Schedule fires while previous execution is running          | Skipped with a warning log — no concurrent executions of the same reflex                      |
| Action dispatch fails (subsystem unavailable)               | Execution logged with `status: failed` and error detail — retried on next trigger             |
| Reflex references a non-existent action verb                | Reflex disabled on load with an error log — validated when TOML is parsed                     |
| Template variable `{{engram_id}}` used in non-event trigger | Variable resolves to empty string — action may fail, logged as error                          |
| reflexes.toml modified while system is running              | File watcher detects changes, reloads definitions, re-registers triggers within 5 seconds     |
| Two reflexes fire on the same event                         | Both execute independently — no ordering guarantees between reflexes                          |

## User Stories

| #   | Story                                                   | Summary                                                              | Status | Parallelisable   |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------- | ------ | ---------------- |
| 01  | [us-01-reflex-definitions](us-01-reflex-definitions.md) | reflexes.toml format parsing, validation, and TOML file watching     | Done   | No (first)       |
| 02  | [us-02-event-triggers](us-02-event-triggers.md)         | Event-based triggers on engram lifecycle events via BullMQ event bus | Done   | Blocked by us-01 |
| 03  | [us-03-threshold-triggers](us-03-threshold-triggers.md) | Threshold-based triggers evaluating Thalamus metrics periodically    | Done   | Blocked by us-01 |
| 04  | [us-04-scheduled-triggers](us-04-scheduled-triggers.md) | Cron-based triggers via BullMQ repeatable jobs                       | Done   | Blocked by us-01 |
| 05  | [us-05-reflex-management](us-05-reflex-management.md)   | Enable/disable, dry-run testing, execution history viewing           | Done   | Blocked by us-01 |

US-01 defines the reflex format and parsing — all other stories depend on it. US-02, US-03, US-04, and US-05 can be built in parallel after US-01.

## Verification

- A reflex with an `event` trigger on `engram.created` fires when a new engram is ingested
- A reflex with a `threshold` trigger fires when 10+ similar engrams exist on a topic and proposes consolidation
- A reflex with a `schedule` trigger fires at the configured cron time and runs the specified Glia worker
- Disabling a reflex stops it from firing — re-enabling resumes execution
- Dry-run testing a reflex shows what it would do without executing the action
- Execution history shows all past firings with trigger data, action details, and outcomes
- Modifying `reflexes.toml` while the system is running reloads definitions within 5 seconds
- Invalid TOML syntax disables all reflexes with a clear error log — does not crash the system
- Event-triggered reflexes with conditions (e.g., `type = "capture"`) only fire for matching events

## Out of Scope

- The actions themselves (Glia, Emit, Ingest define what happens — Reflex only defines when)
- Complex conditional logic or branching (reflexes are simple trigger-action rules, not workflows)
- External webhook receivers (future — Plexus adapters could emit events that trigger reflexes)
- User-facing reflex creation UI (reflexes are configured via TOML file — a UI editor is future work)

## Drift Check

last checked: 2026-04-28

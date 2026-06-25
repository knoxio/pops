# Reflex System

> Status: Partial — the definition/registry/management plane and pure trigger-matching logic ship; the autonomous runtime that actually fires triggers and dispatches actions is NOT wired (no event bus, no periodic threshold job, no cron scheduler, no action dispatch). See [ideas/reflex-runtime-firing-and-dispatch.md](../ideas/reflex-runtime-firing-and-dispatch.md).

Declarative event-action automation for Cerebrum. The operator authors trigger-action rules in `reflexes.toml`; the pillar parses and validates them, holds them in an in-memory registry, exposes a REST management surface (list / inspect / dry-run / enable / disable / history), and records every firing in an append-only execution log. A reflex says _when_ something should happen (event, threshold, or schedule) and _what_ subsystem verb to run (Ingest / Emit / Glia) — it does not implement the action itself.

The reflex registry, execution log, and (eventually) the engram events it would react to all live in the cerebrum pillar's own SQLite DB.

## Data Model

### Reflex definition (`reflexes.toml`)

Array-of-tables, one `[[reflex]]` per rule. The file is the source of truth; enable/disable rewrites it in place.

```toml
[[reflex]]
name = "auto-classify-captures"
description = "Classify new captures after ingestion"
enabled = true
trigger = { type = "event", event = "engram.created", conditions = { type = "capture" } }
action = { type = "ingest", verb = "classify", target = "{{engram_id}}" }
```

Fields: `name` (string, required, unique), `description` (string, required), `enabled` (boolean, required), `trigger` (object, required), `action` (object, required).

Trigger variants (discriminated on `type`):

- `event` — `event` ∈ {`engram.created`, `engram.modified`, `engram.archived`, `engram.linked`}; optional `conditions` = `{ type?, scopes?, source? }`.
- `threshold` — `metric` ∈ {`similar_count`, `staleness_max`, `topic_frequency`}, `value` (number), optional `scopes`.
- `schedule` — `cron` (5-field expression).

Action: `type` ∈ {`ingest`, `emit`, `glia`}, `verb` (string), optional `template`, `scopes`, `target`. Known verbs: glia → `prune`/`consolidate`/`link`/`audit`; emit → `generate`; ingest → `classify`/`ingest`. Template variables (`{{engram_id}}`, `{{engram_type}}`, `{{engram_scopes}}`) are only meaningful for event triggers.

### `reflex_executions` (cerebrum SQLite)

| Column         | Type          | Notes                                                 |
| -------------- | ------------- | ----------------------------------------------------- |
| `id`           | TEXT PK       | `rex_{reflexName}_{epochMs}`                          |
| `reflex_name`  | TEXT NOT NULL |                                                       |
| `trigger_type` | TEXT NOT NULL | `event` / `threshold` / `schedule`                    |
| `trigger_data` | TEXT          | JSON — event payload, metric+value, or cron+firedAt   |
| `action_type`  | TEXT NOT NULL | `ingest` / `emit` / `glia`                            |
| `action_verb`  | TEXT NOT NULL |                                                       |
| `status`       | TEXT NOT NULL | `triggered` / `executing` / `completed` / `failed`    |
| `result`       | TEXT          | JSON — action output, dry-run marker, or error detail |
| `triggered_at` | TEXT NOT NULL | ISO 8601                                              |
| `completed_at` | TEXT          | ISO 8601, set on `completed`/`failed`                 |

Indexed on `reflex_name`, `trigger_type`, `status`, `triggered_at`.

## REST API Surface

Served under the cerebrum pillar contract (`rest-reflex.ts`), docker-network trust boundary, no per-request auth (parity with templates).

| Method | Path                    | Purpose                                                                                                                    |
| ------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/reflex?timezone=`     | List all reflexes enriched with runtime status (`lastExecutionAt`, `nextFireTime`, `executionCount`)                       |
| `GET`  | `/reflex/:name`         | One reflex with status + recent execution history (404 unknown)                                                            |
| `POST` | `/reflex/:name/test`    | Dry-run: logs a `completed` execution carrying `dryRun: true` + `wouldExecute`; no side effects (404 unknown)              |
| `POST` | `/reflex/:name/enable`  | Set `enabled = true` in the TOML and reload (404 unknown)                                                                  |
| `POST` | `/reflex/:name/disable` | Set `enabled = false` in the TOML and reload (404 unknown)                                                                 |
| `POST` | `/reflex/history`       | Filtered + paginated execution log (`name?`, `triggerType?`, `status?`, `limit?≤200`, `offset?`) → `{ executions, total }` |

`history` is POST-with-body because the typed enum filters don't round-trip cleanly through a query string.

## Business Rules

- `reflexes.toml` is the source of truth. A missing file is tolerated (empty reflex set) so the pillar boots without any config. Config path resolves from `CEREBRUM_REFLEX_CONFIG`, else `CEREBRUM_REFLEX_CONFIG_DIR`/`ENGRAM_ROOT` + `.config/reflexes.toml`, else a cwd default.
- Parsing is strict but non-fatal per reflex: a TOML _syntax_ error disables the whole file (zero reflexes loaded); a single invalid `[[reflex]]` is skipped with a logged error while the rest load. Validation covers required fields, unique names, valid trigger/action enums, and a 5-field cron check.
- Template variables used on a non-event trigger produce a load-time _warning_, not a hard error — the variable would resolve to an empty string at runtime.
- A chokidar watcher (enabled by default, opt-out for tests) reloads the registry when the file changes on disk; stale threshold state for removed reflexes is dropped on reload.
- Enable/disable rewrites only the target reflex's `enabled` line via a targeted line-level edit, preserving comments, formatting, and ordering, then reloads.
- The registry exposes `getAll` / `getByName` / `getEnabled` / `getByTriggerType` for trigger logic.
- Dry-run `test` builds synthetic trigger data per type and records a `completed` row with `result.dryRun = true`; it never dispatches a real action.
- `nextFireTime` for schedule triggers is computed on read from the cron expression (timezone-aware via the `timezone` query param). `executionCount` / `lastExecutionAt` are aggregated from the execution log.

### Pure trigger logic (shipped, not yet driven at runtime)

- Event matching: an event payload matches a reflex when the reflex is enabled, the event type matches, and all `conditions` hold — `type` exact, `source` exact, `scopes` prefix (`work.*` matches `work` and `work.foo`). Template resolution fills `{{engram_id}}` / `{{engram_type}}` / `{{engram_scopes}}` from the payload.
- Threshold matching is edge-detected (hysteresis): fires once on a rising-edge crossing (`value ≥ threshold` when previously below), then suppressed until the metric drops below and crosses again. State is held in-memory per reflex.

These matchers exist as pure functions but have no caller that fires at runtime: `matchesEventTrigger` is only invoked from `ReflexService.processEvent` and `evaluateThreshold` only from `ReflexService.evaluateThresholds`, and neither of those service methods is called by production code or a timer. (The `test` dry-run, `nextFireTime`, and TOML validation paths exercise the surrounding registry/parsing logic, not these matchers.) **No production code emits engram events into them, evaluates thresholds on a timer, registers cron jobs, or dispatches the resulting actions** — that runtime is captured in the ideas file.

## Edge Cases

| Case                              | Behaviour                                                                  |
| --------------------------------- | -------------------------------------------------------------------------- |
| `reflexes.toml` syntax error      | All reflexes disabled, error logged with parse location — pillar continues |
| Single invalid `[[reflex]]`       | That reflex skipped + logged; others load                                  |
| Template var on non-event trigger | Load-time warning; reflex still loads                                      |
| `reflexes.toml` edited at runtime | Watcher reloads the registry; stale threshold state pruned                 |
| Reflex removed from TOML          | Dropped from registry on reload; its threshold state cleared               |
| Enable/disable unknown name       | `404` with the reflex name                                                 |
| Dry-run any reflex                | Logs a `completed` execution with `dryRun: true`; no action runs           |

## Acceptance Criteria

- [x] `[[reflex]]` array-of-tables in `reflexes.toml` parses into validated definitions; required fields, unique names, and trigger/action enums are enforced; a 5-field cron is validated.
- [x] A TOML syntax error disables all reflexes (logged); one invalid reflex is skipped without taking down the rest.
- [x] Template variables on a non-event trigger emit a load-time warning rather than failing the load.
- [x] A file watcher reloads the registry on disk change and prunes threshold state for reflexes that disappeared.
- [x] The registry exposes `getAll` / `getByName` / `getEnabled` / `getByTriggerType`.
- [x] `GET /reflex` returns every reflex with `enabled`, trigger type, `lastExecutionAt`, `nextFireTime` (schedule, timezone-aware), and `executionCount`.
- [x] `GET /reflex/:name` returns the reflex plus recent history; unknown name → `404`.
- [x] `POST /reflex/:name/enable` and `/disable` flip the `enabled` line in the TOML preserving comments/order, then reload; unknown name → `404`.
- [x] `POST /reflex/:name/test` runs a dry-run, returns the result, and logs a `completed` execution with `dryRun: true`; no side effects.
- [x] `POST /reflex/history` returns paginated executions filterable by `name`, `triggerType`, and `status`, with a `total`.
- [x] Event-trigger matching honours `type`/`source` exact and `scopes` prefix conditions; template variables resolve from the event payload.
- [x] Threshold matching is edge-detected — one fire per rising-edge crossing, suppressed until the metric drops and re-crosses.
- [x] Every execution is recorded in `reflex_executions` with full trigger data, action type/verb, status, and outcome.
- [x] A frontend reflex list page and detail page (definition panel + history table) render the management surface.

## Out of Scope

- The actions themselves — Ingest / Emit / Glia define _what_ happens; reflexes only describe _when_ and _which verb_.
- Conditional logic, branching, or multi-step workflows (rules are flat trigger→action).
- A UI editor for authoring reflexes (the TOML file is the authoring surface; the UI is read + enable/disable/test only).
- The autonomous runtime — event bus, periodic threshold evaluation, cron scheduling, and action dispatch — see [ideas/reflex-runtime-firing-and-dispatch.md](../ideas/reflex-runtime-firing-and-dispatch.md).

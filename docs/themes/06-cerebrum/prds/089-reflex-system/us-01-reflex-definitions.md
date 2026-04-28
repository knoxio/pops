# US-01: Reflex Definitions

> PRD: [PRD-089: Reflex System](README.md)

## Description

As the Cerebrum system, I need a parser and validator for the `reflexes.toml` configuration format with file watching so that reflexes can be defined declaratively and changes take effect without restart.

## Acceptance Criteria

- [x] A `reflexes.toml` file in `engrams/.config/` defines reflexes using the `[[reflex]]` TOML array-of-tables syntax, with fields: `name` (string, required, unique), `description` (string, required), `enabled` (boolean, required), `trigger` (object with `type` field, required), `action` (object with `type` and `verb` fields, required)
- [x] A Zod schema validates reflex definitions on load: trigger type must be one of `event`, `threshold`, `schedule`; action type must be one of `ingest`, `emit`, `glia`; name must be unique across all reflexes; enabled must be a boolean
- [x] Event triggers validate: `event` field is one of `engram.created`, `engram.modified`, `engram.archived`, `engram.linked`; optional `conditions` object with engram field filters (type, scopes, source)
- [x] Threshold triggers validate: `metric` field is one of `similar_count`, `staleness_max`, `topic_frequency`; `value` is a positive number; optional `scopes` array for restricting evaluation
- [x] Schedule triggers validate: `cron` field is a valid 5-field cron expression (minute, hour, day-of-month, month, day-of-week)
- [x] Action definitions validate: `verb` is a known verb for the action type (e.g., `glia` supports `prune`, `consolidate`, `link`, `audit`); template variables like `{{engram_id}}` are only valid for event-triggered reflexes
- [x] A file watcher on `reflexes.toml` detects modifications and reloads all reflex definitions within 5 seconds — invalid TOML syntax or validation errors disable all reflexes and log a structured error with the parse failure location
- [x] A `ReflexRegistry` class holds loaded reflex definitions and provides methods: `getAll()`, `getByName(name)`, `getEnabled()`, `getByTriggerType(type)` — used by trigger implementations to find relevant reflexes

## Notes

- Use a TOML parser like `@iarna/toml` or `smol-toml` for parsing — TOML is the natural fit for this kind of declarative configuration.
- The validation should be strict on load but not crash the system — one invalid reflex should disable only that reflex, not all reflexes. The "all disabled on parse error" case only applies to TOML syntax errors (the whole file is unparseable).
- Template variable validation (`{{engram_id}}` only for event triggers) should produce a warning on load, not a hard error — the variable will resolve to empty string at runtime, which may or may not cause an action failure.
- Consider providing a default `reflexes.toml` with the four standard reflexes (daily staleness scan, weekly summary, auto-classify captures, consolidation check) as a starting point.

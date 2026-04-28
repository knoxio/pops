# Epic 06: Reflex

> Theme: [Cerebrum](../README.md)

## Scope

Build the automation system that triggers actions in response to events, thresholds, or schedules — without requiring user prompts. Reflexes are defined in `reflexes.toml` as declarative rules: "when X happens, do Y." Examples: when an engram is created, classify and embed it; when 10 engrams on a similar topic exist, propose consolidation; every Sunday at 8am, generate a weekly summary. After this epic, Cerebrum operates proactively rather than reactively.

## PRDs

| #   | PRD                                                  | Summary                                                                                       | Status |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ |
| 089 | [Reflex System](../prds/089-reflex-system/README.md) | Reflex definitions, trigger types (event/threshold/scheduled), action dispatch, management UI | Done   |

Single PRD — the reflex system is a unified event-action framework. Splitting by trigger type would create artificial seams in what is naturally a single dispatch loop.

## Dependencies

- **Requires:** Epic 00 (engram events to trigger on), Epic 01 (Thalamus — threshold detection), Epic 04 (Glia — curation actions to dispatch), Infrastructure PRD-074 (BullMQ for job scheduling)
- **Unlocks:** Fully autonomous system behaviour, scheduled outputs, event-driven curation

## Out of Scope

- The actions themselves (Glia, Emit, Ingest define what happens — Reflex only decides when)
- External webhook receivers (future — Plexus adapters could emit events that Reflex triggers on)
- Complex conditional logic or branching (reflexes are simple trigger → action rules, not workflows)

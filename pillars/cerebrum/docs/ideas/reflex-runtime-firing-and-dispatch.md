# Reflex runtime: firing and action dispatch

The reflex definition/registry/management plane ships (see PRD `reflex-system`): TOML is parsed and validated, reflexes live in an in-memory registry with a file watcher, the REST surface lists/inspects/dry-runs/toggles them, and every firing is recorded in `reflex_executions`. The pure matching logic (event condition matching with scope-prefix rules, threshold edge-detection, cron next-fire computation) is implemented and unit-covered.

What is **not** built is the part that makes Cerebrum proactive: nothing actually drives the triggers at runtime, and nothing dispatches the resulting actions. `ReflexService.processEvent`, `evaluateThresholds`, `fireScheduled`, and `completeExecution` have no production callers. The cerebrum worker contains zero reflex code. The "BullMQ repeatable jobs" referenced in `scheduled-trigger.ts` are doc-comments and string helpers (`scheduledJobName`/`scheduledJobId`) — no queue is created, no job is registered.

Build this later, ideally in the cerebrum worker (not the request path):

## Event bus + event triggers

- A producer that emits engram lifecycle events (`engram.created`, `engram.modified`, `engram.archived`, `engram.linked`) whenever the engram CRUD path mutates an engram, carrying `{ engramId, engramType, scopes, source, changes }`.
- A consumer that feeds each event through `ReflexService.processEvent`, dispatches the matched action (with template variables already resolved into `action.target`), and calls `completeExecution` with the outcome.
- Dispatch is async and fire-and-forget from the producer's perspective; multiple reflexes on one event run independently with no ordering guarantee, and one failure must not block others. A dead-letter path for failed dispatches so they are not silently lost.
- Events should be emitted after any debounce upstream (Thalamus), not before, to avoid storms.

## Periodic threshold evaluation

- A repeatable job (default ~30 min, ideally per-metric configurable since `similar_count` is expensive) that, for each enabled threshold reflex, computes the metric and calls `ReflexService.evaluateThresholds`.
- Metric sources: `similar_count` (similarity clustering — cluster size), `staleness_max` (highest staleness score across active engrams), `topic_frequency` (max count of engrams sharing a topic), each optionally scope-restricted. These query existing services; threshold triggers keep no data store of their own.
- The in-memory edge-detection state already lives in `ReflexService`; on a crossing, dispatch the action and record the metric + value in `trigger_data`. Evaluation failures (source unavailable, timeout) log and skip the cycle, re-evaluating next time. A persisted `last_triggered_value` would make edge-detection survive restarts.

## Cron scheduling + dispatch

- Register a repeatable job per enabled schedule reflex from its `cron` (timezone-aware, using the system timezone — "Sunday 8am" means the user's 8am), re-registering on TOML reload and tearing down jobs for removed/disabled reflexes; clean up stale jobs on startup.
- On fire, call `ReflexService.fireScheduled` (which already guards against concurrent runs of the same reflex via the in-memory running-set and skips with a warning) and dispatch the action.

## Shared action dispatch layer

- A dispatcher mapping `action.type` → the subsystem call: `ingest` verbs to the ingestion pipeline, `emit` verbs to output production, `glia` verbs to worker runs (`prune`/`consolidate`/`link`/`audit`).
- Dispatch honours a dry-run flag so the existing `test` path could route through the real dispatcher (Glia `dryRun: true`, Emit preview, Ingest preview) instead of just logging a synthetic `completed` row.
- Every dispatch transitions the execution row `triggered → executing → completed|failed` via `completeExecution`; failures log `status: failed` with error detail and are retried on the next trigger.
- Execution-log retention: prune to a configurable cap (e.g. 1000 rows per reflex) on write to keep the table bounded.

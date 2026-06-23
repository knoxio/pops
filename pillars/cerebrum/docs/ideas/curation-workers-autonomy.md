# Idea: Curation Workers — Scheduling, Autonomy & Reference Tracking

Forward-looking work split out of the shipped curation-workers PRD. The four
workers (pruner, consolidator, linker, auditor) exist and produce proposals
synchronously over REST, but everything that makes them _autonomous_ and
_scheduled_ is not built. Each item below is a "build this later".

## Background-job execution on a glia queue

Today the four workers run synchronously inside their `POST /glia/workers/*`
handlers. They are not BullMQ jobs. The only worker queues the pillar runs are
`pops-embeddings` (dense-vector indexing) and `pops-curation` (ingest
classify/extract enrichment) — neither touches the curation workers.

Build: a `pops:glia` queue with per-worker job names (`glia:prune`,
`glia:consolidate`, `glia:link`, `glia:audit`) consumed by the cerebrum worker
process, so a full-corpus scan runs off the request path. The Reflex system
(reflex domain) already references a `glia:prune` dispatch as a dry-run
placeholder — wire it to a real queue producer.

## Trust-phase-driven execution (depends on PRD trust-graduation)

The worker classes contain `act_report` / `silent` execution branches
(`archiveEngram`, `createMerged`, `linkEngrams`, `executed` status), but the
REST handlers never inject a real `TrustPhaseProvider` — they always run with
`DefaultTrustPhaseProvider` (always `propose`) and default `dryRun: true`. So
in practice the workers only ever return proposals; the execute paths are
unreachable from the API.

Build: inject the live per-action-type trust state (owned by the
trust-graduation domain) into each worker so that, outside `propose`,
`runPruner`/`runConsolidator`/`runLinker`/`runAuditor` actually mutate engrams
and persist the resulting actions to the `glia_actions` table. Today the
`run*` endpoints return ephemeral actions and never persist.

## Reference / query-hit tracking for staleness

The pruner's staleness model has two factors — "days since last referenced"
and "query hit count" — that have no data source. The handler injects
`getQueryHitCount = () => 0` and `getLastQueriedAt = () => undefined`, so both
factors always contribute maximum staleness and the "recent query resets
staleness" / orphan-by-query-window behaviour can never fire.

Build: have the retrieval/index layer track, per engram, a `query_hits`
counter and a `last_queried_at` timestamp (incremented whenever a search
returns that engram), and feed them into the pruner lookups. Only then do the
0.2 query-hit weight and the 7-day recent-query reset become meaningful, and
orphan detection can use "no query hits in the last N days" rather than the
current inbound-links-only check.

## Per-worker thresholds in glia.toml

Worker thresholds (staleness 0.7, orphan 0.5/90d, similarity 0.85, link
threshold 2 / similarity 0.7 / max-5, quality 0.3, min-2-per-topic) are
hardcoded `DEFAULT_*_CONFIG` constants. The `glia.toml` loader only parses the
`[trust.graduation]` block (for the trust-graduation domain); there is no
`[pruner]` / `[consolidator]` / `[linker]` / `[auditor]` section.

Build: extend the glia.toml loader and the worker handlers to read per-worker
config sections so thresholds are tunable without a redeploy.

## Consolidator: re-point external inbound links

When the consolidator merges a cluster it carries forward the union of the
cluster's _own_ outbound links and tags onto the merged engram, then archives
the originals. It does NOT update engrams _outside_ the cluster that linked to
a now-archived source — those links dangle at the archived engram.

Build: on merge, find every engram whose `links` array references a source
engram and re-point it to the merged engram's id.

## Execution-time staleness guard

No worker re-checks an engram's `modified_at` between scan and execution. If an
engram changes after it was scanned, the worker would still act on the stale
plan.

Build: re-read and compare `modified_at` immediately before any mutating
execution (archive / merge / link) and abort that action if the engram changed.

## Auditor: nudge emission in act/silent phases

The auditor is read-only and only ever produces proposals today. The plan was
for `act_report` / `silent` audit findings to optionally emit nudges (nudges
domain) rather than just sitting in the proposal queue.

Build: in non-propose phases, route contradiction / low-quality / coverage-gap
findings to the nudge pipeline.

# Idea: Scheduled cross-source indexing, books source, and a reindex CLI

Forward-looking extensions to the cerebrum `indexing` PRD. The on-demand and
file-watcher paths are built; these three pieces are not.

## Scheduled cross-source re-index

Today cross-source re-embedding only runs when something calls
`POST /index/reindex-sources`. There is no scheduler.

Build a recurring job (cron / BullMQ repeatable) that runs `scanAndEnqueue` over
all source types on an interval (proposed default: every 6 hours), so peer-pillar
rows that change get re-embedded without a manual trigger.

- Interval should be configurable (env or pillar settings).
- Each source type should be independently enable/disable-able via config,
  defaulting to all enabled. Right now the only selection mechanism is the
  per-request `sourceTypes` array.

## Books as a cross-source type

`CROSS_SOURCE_TYPES` currently covers `transaction`, `movie`, `tv_show`,
`inventory`. Books are not indexed despite being in the original design.

To add them:

- Add `'book'` to `CROSS_SOURCE_TYPES`.
- Add `listBooks(limit, offset)` to the media peer client and a
  `MediaBookListRow` row type.
- Add a `toBookText(row)` formatter (e.g. `Title`, `Author`, `Description`,
  personal notes), following the existing labelled-section pattern.
- The pipeline is generic, so once the peer LIST method and formatter exist the
  scan/enqueue path needs no other change.

Same extension point applies to any future source (recipes, contacts, etc.):
implement a peer LIST method + a `toXText()` formatter + register the type.

## `pops cerebrum reindex` CLI

A CLI command that triggers a full reconcile + reindex of all engrams and
cross-source rows from the shell. Not built — the only entry points today are the
REST `/index/*` endpoints. A thin CLI wrapper that calls `reindex(force)` and
`reindexSources()` over the pillar's own HTTP surface would cover it.

# Ingest queue resilience & delayed-retry wiring

Forward-looking gaps in the `food.ingest` producer/queue contract. The
endpoints, queue, worker dispatch, and worker-complete callback already ship
(see `prds/ingest-api`). These are the pieces the original `ingest-api` spec
described that are **not** built yet.

## Delayed retry from `retryAfterSec`

The worker already emits `retryAfterSec` on the Instagram rate-limited path
(`src/worker/handlers/instagram/convert-acquisition-failure.ts` sets it to the
`Retry-After` value). `IngestJobResult.ok:false` carries the field. But nothing
on the producer side maps it back into BullMQ's per-attempt backoff — the queue
just uses the static exponential backoff (`5s/10s/20s`).

Build: when `workerComplete` (or a worker `failed` listener) sees a failure
result with `retryAfterSec`, schedule the next BullMQ attempt with
`{ delay: retryAfterSec * 1000 }` instead of the default exponential delay, so a
rate-limited Instagram fetch waits exactly as long as Instagram asked.

## Stalled-job detection config

The current worker enforces a per-job ceiling in-band via `Promise.race` against
`FOOD_INGEST_TIMEOUT_SEC` (returns a `TimedOut` failure result). BullMQ's native
stalled-job detection (`stalledInterval`, `maxStalledCount`) is **not**
configured on the `Worker`. A worker that crashes mid-job (process killed, not a
timeout) relies entirely on BullMQ defaults for lock recovery.

Build: configure `stalledInterval: 30000` and `maxStalledCount: 1` on the
`Worker` so a hard crash gets the job re-delivered within ~30s and re-tried up to
`attempts`, and add an integration test that simulates a stalled job (delay >
`stalledInterval`) and asserts recovery.

## Compile-on-complete

`workerComplete` on `ok:true` creates an **uncompiled** draft recipe + first
version and always returns `compileStatus: 'uncompiled'`. The compile pass
(slug resolution / `creations` flow) is deliberately deferred to inbox approval,
not run at ingest time. The `compileStatus` union still carries `'compiled'` and
`'failed'` members that this path never returns.

If we ever want eager compile at ingest time (so the inbox can show compile
errors before the user approves), `workerComplete` would call the compile
pipeline inside the same transaction and return the real `compileStatus`. This
requires breaking the `pops-api → app-food → api-client` package cycle that
currently keeps the compile call out of the server-side path.

## Cross-ingest dedup

No dedup in the current producer: submitting the same URL twice within seconds
creates two `ingest_sources` rows and two jobs. A future content-hash or
URL+window dedup could collapse duplicate submissions before enqueue.

## Dedicated submission UI

There is no in-pillar "submit an ingest" page; only the inbox pages consume
`list`/`status` to review what the pipeline produced. A submission surface
(paste URL / drop screenshot / paste text, then poll `status` to a terminal
state) would let a user kick off an ingest from the food app directly rather
than via API.

# US-03: Quick Capture via Moltbot and CLI

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Partial

## Description

As a user on the go (via Moltbot on Telegram or the pops CLI), I want to fire off a raw thought or note with zero friction so that it lands as an engram immediately and gets classified later by Cortex.

## Acceptance Criteria

- [ ] A `pops cerebrum capture "text"` CLI command accepts raw text as a single argument or from stdin and creates an engram via `cerebrum.ingest.quickCapture`
- [ ] Moltbot accepts a `/capture` command (or a configurable prefix/trigger) followed by raw text and creates an engram via the same `quickCapture` path
- [x] Quick capture assigns `type: capture`, `source: moltbot` (or `cli` depending on channel), and the fallback scope from `scope-rules.toml`
- [x] Quick capture skips classification, entity extraction, and scope inference at ingestion time — the engram is written immediately
- [x] A background job is enqueued (via BullMQ) to run Cortex classification and entity extraction on the captured engram asynchronously
- [ ] The background job updates the engram's `type`, `template`, `tags`, and `scopes` in both the file and the index when classification completes
- [ ] The CLI command outputs the engram ID and a confirmation message; Moltbot responds with the engram ID and a brief confirmation
- [x] Captures with only whitespace or empty text are rejected with an error message

## Notes

- Quick capture is the lowest-friction input path — it should complete in under 500ms for the user-facing response, with all intelligence deferred to background processing.
- The background classification job should be idempotent — if it runs twice on the same engram, the second run is a no-op if the content has not changed.
- Moltbot integration uses the existing Moltbot command framework from the pops Telegram bot.
- The fallback scope from `scope-rules.toml` is typically `personal.captures` — see PRD-078.

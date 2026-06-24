# Idea: agent + CLI capture channels and ingest refinements

The REST ingestion pipeline (`pillars/cerebrum/src/api/modules/ingest`, `rest-ingest.ts`) and the
shell capture surface are built. The non-shell input channels and a few pipeline refinements
described in the original `ingestion-pipeline` are not. Collected here as forward work.

## Agent capture via MCP

The MCP channel (`pillars/mcp`) exposes only read tools for cerebrum today
(`cerebrum.engrams.list`, `cerebrum.engrams.get`, `cerebrum.search`) — no write/capture tools.
The full write surface (`cerebrum.ingest`, `cerebrum.query`, `cerebrum.engrams.update`) is
specified in [mcp-write-and-query-tools.md](mcp-write-and-query-tools.md); build that first.

Additional capture-specific nuances from `ingestion-pipeline` to fold in when wiring those tools:

- A lightweight `cerebrum.quick_capture` tool taking just `text` (and optional `source`),
  returning `{ id, path, type, scopes }`, distinct from the richer `cerebrum.ingest`.
- A full `cerebrum.ingest` tool that routes to `POST /ingest/submit` (not just quick-capture) so
  an agent can run the complete classify/extract/scope pipeline with explicit fields, getting the
  inferred classification + extracted entities back. Agent input is expected to be the
  highest-volume channel — the handler must tolerate rapid successive calls without racing on id
  generation or the dedup check.
- Tool input validation returns structured field-level errors (`VALIDATION_ERROR`), never a
  generic 500.

## Quick capture via CLI and Moltbot

- `pops cerebrum capture "text"` — a CLI command accepting raw text as an argument or from stdin,
  hitting `POST /ingest/quick-capture` with `source: 'cli'`, printing the engram id and a
  confirmation. There is no `pops` CLI binary wired to cerebrum today.
- A wired Moltbot `/capture <text>` command that calls `POST /ingest/quick-capture` with
  `source: 'moltbot'`. The `pops-cerebrum` Moltbot skill prompt exists but points at the dead
  `pops-api:3000` monolith and `cerebrum.retrieval.scopes`; rewrite it against the cerebrum
  pillar's REST contract (via the pillar SDK / registry) before relying on it.
- Both paths reuse the same async-enrichment flow: write `type: capture` immediately, enqueue
  `classifyEngram`, respond in well under the user-facing budget.

## JSON-body metadata lift (agent input)

The normaliser renders a valid-JSON body as a fenced ` ```json ` block but does **not** lift
keys out of it. `ingestion-pipeline` wanted: when an agent posts a plain JSON object, lift `title`/`type`/
`scopes`/`tags` into the ingest request and persist the remaining keys as frontmatter custom
fields (JSON arrays/primitives still fence but contribute no metadata). Build this on the
`submit` path so structured agent payloads enrich the engram instead of being inert code blocks.

## Configurable confidence thresholds

Classification (0.6) and entity-extraction (0.7) thresholds are hardcoded constants — the pillar
has no settings service to override them. `ingestion-pipeline` wanted these configurable
(e.g. `engrams/.config/cortex.toml`). Wire them to the cerebrum settings group so operators can
tune precision/recall without a redeploy. Also consider caching classification by content hash to
avoid redundant LLM calls during reprocessing.

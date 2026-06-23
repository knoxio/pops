# Idea: MCP write + NL-query tools for cerebrum

Today the MCP channel (`pillars/mcp`) exposes only read tools against cerebrum:
`cerebrum.search`, `cerebrum.engrams.list`, `cerebrum.engrams.get`. An MCP client can
discover and read the knowledge base but cannot add to it or ask grounded questions
through MCP. Extend the cerebrum tool set so a Claude Code session can capture and
query without leaving the IDE.

## Proposed tools

- `cerebrum.ingest` — quick-capture a note from the agent.
  - Backed by `POST /ingest/quick-capture` with `source: 'agent'`.
  - Input `{ body|text, title?, type?, scopes?, tags? }`; returns the new engram id/title/scopes/path.
- `cerebrum.query` — natural-language Q&A grounded in retrieval.
  - Backed by `POST /query/ask` (`{ question, scopes?, maxSources?, includeSecret? }`).
  - Returns `{ answer, citations: [{ id, title, relevance }] }`. Cap retrieval to a
    small top-N for latency (the unwired `cerebrum.mcp.queryMaxSources` setting,
    default 3, is the intended knob).
- `cerebrum.engrams.update` — edit an existing engram (`PATCH`/update endpoint),
  input `{ id, body?, title?, scopes?, tags? }`.

## Requirements

- Enforce scope boundaries in the tools: `.secret.*` engrams are excluded from
  search/query context unless `scopes`/`includeSecret` explicitly opts in.
- Statelessness stays: each MCP call is self-contained — no multi-turn conversation
  state across tool calls. Multi-turn Q&A belongs to the shell chat panel.
- Wire the existing-but-unused `cerebrum.mcp.*` settings group
  (`queryMaxSources`, `searchSnippetLength`, `searchDefaultLimit`) into the
  search/query handlers so the manifest stops lying.
- Errors return structured tool results (`isError: true`) with a stable code
  (`NOT_FOUND`, `VALIDATION_ERROR`, `SCOPE_BLOCKED`).

## Why later

The read tools already cover the highest-value MCP use (search/read mid-session).
Write and grounded-query tools touch the ingest pipeline and the Ego/query engine
and need scope-enforcement and latency budgeting that the read tools don't.

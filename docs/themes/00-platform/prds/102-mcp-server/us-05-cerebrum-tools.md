# US-05: Cerebrum tools

> PRD: [PRD-102 — MCP Server](README.md)
> Status: Done

## Goal

Expose engram read access and hybrid semantic search via MCP tools.

## Acceptance Criteria

- [x] `cerebrum.engrams.list` — accepts `search`, `type`, `scopes` (string array), `tags` (string array), `status`, `limit`, `offset`; calls `cerebrum.engrams.list`
- [x] `cerebrum.engrams.get` — accepts `id` (required); calls `cerebrum.engrams.get`
- [x] `cerebrum.search` — accepts `query` (required), `mode` (`semantic | structured | hybrid`), `limit`; calls `cerebrum.retrieval.search`
- [x] Array inputs (`scopes`, `tags`) are filtered to string-only elements before being passed to tRPC
- [x] `mode` defaults to `hybrid` when not provided

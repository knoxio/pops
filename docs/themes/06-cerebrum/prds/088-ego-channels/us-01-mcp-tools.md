# US-01: MCP Tools for Claude Code

> PRD: [PRD-088: Ego Channels](README.md)
> Status: Done

## Description

As a developer using Claude Code, I want MCP tool definitions for Cerebrum operations so that Claude Code sessions can search my knowledge base, ingest new content, ask natural-language questions, and read or write engrams without leaving the IDE.

## Acceptance Criteria

- [x] Five MCP tools are registered on the localhost MCP server: `cerebrum.search`, `cerebrum.ingest`, `cerebrum.query`, `cerebrum.engram.read`, `cerebrum.engram.write`
- [x] `cerebrum.search` accepts `{ query: string, scopes?: string[], limit?: number }` and returns `{ results: Array<{ id, title, score, scopes, snippet }> }` — delegates to Thalamus retrieval
- [x] `cerebrum.ingest` accepts `{ body: string, title?: string, type?: string, scopes?: string[], tags?: string[] }` and returns `{ engram: { id, title, type, scopes, filePath } }` — delegates to the ingest pipeline with `source: 'agent'`
- [x] `cerebrum.query` accepts `{ question: string, scopes?: string[] }` and returns `{ answer: string, citations: Array<{ id, title, relevance }> }` — creates a one-shot Ego conversation, retrieves relevant engrams, generates a grounded answer
- [x] `cerebrum.engram.read` accepts `{ id: string }` and returns `{ engram: { id, title, type, scopes, tags, status, created, modified }, body: string }` — reads the engram file and returns parsed content
- [x] `cerebrum.engram.write` accepts `{ id: string, body?: string, title?: string, scopes?: string[], tags?: string[] }` and returns `{ engram: { id, title, type, scopes, modified } }` — updates the engram via the CRUD service
- [x] Each tool has a complete JSON Schema definition with descriptions for every parameter, used by Claude Code for tool discovery and parameter validation
- [x] All tools enforce scope boundaries — `.secret.` scoped engrams are excluded from search results and query context unless the `scopes` parameter explicitly includes the secret scope
- [x] Errors return structured JSON with an `error` field containing a human-readable message and a `code` field for programmatic handling (e.g., `NOT_FOUND`, `VALIDATION_ERROR`, `SCOPE_BLOCKED`)

## Notes

- MCP tools are stateless — each call creates a fresh context. For multi-turn conversations, the user should use the shell chat panel or CLI instead.
- The MCP server runs on localhost only — no network exposure. Connection details are configured in Claude Code's MCP settings.
- Tool names use dot notation (`cerebrum.search`) which is valid in MCP tool naming. Claude Code uses these names for tool discovery.
- The `cerebrum.query` tool is the highest-value MCP integration — it lets Claude Code ask questions about the user's knowledge base mid-conversation. Keep latency low by limiting Thalamus retrieval to top-3 results for MCP queries.

# US-02: Agent Input via MCP and API

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Not started

## Description

As an AI agent (Claude Code session or external tool), I want to write engrams through MCP tools and a tRPC API endpoint so that knowledge captured during agent sessions is ingested with minimal friction, accepting either raw Markdown or structured data.

## Acceptance Criteria

- [ ] An MCP tool `cerebrum_ingest` is registered with the pops MCP server, accepting parameters: `body` (required), `title` (optional), `type` (optional), `scopes` (optional string array), `tags` (optional string array)
- [ ] An MCP tool `cerebrum_quick_capture` is registered for lightweight capture, accepting a single `text` parameter — delegates to `cerebrum.ingest.quickCapture`
- [ ] The tRPC procedure `cerebrum.ingest.submit` accepts the full `IngestionRequest` schema and runs the complete pipeline (normalise, classify, extract, scope, deduplicate, write)
- [ ] When `type` is omitted, the pipeline runs Cortex classification on the body and assigns the inferred type
- [ ] When `scopes` are omitted, the pipeline runs scope inference (source-based rules first, then LLM-based analysis)
- [ ] Raw Markdown input is normalised (trimmed, line endings normalised, UTF-8 validated) before processing
- [ ] Structured JSON input (detected by content inspection) is converted to Markdown with metadata extracted into frontmatter fields
- [ ] The MCP tools return the created engram's ID, file path, type, and assigned scopes in the response
- [ ] Invalid input (empty body, malformed scopes) returns structured error messages with field-level detail, not generic 500 errors

## Notes

- MCP tool registration follows the existing pops MCP server patterns (localhost-only, no auth beyond MCP session).
- The `cerebrum_ingest` tool should include a `description` field in its MCP registration that explains available parameters — this is what Claude Code sees when discovering tools.
- Agent input is expected to be the highest-volume input channel — the pipeline should handle rapid successive calls without race conditions on ID generation or deduplication checks.
- The tRPC endpoint is the canonical API; the MCP tools are thin wrappers that delegate to the same `cerebrum.ingest.submit` procedure.

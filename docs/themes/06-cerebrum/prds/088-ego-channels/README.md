# PRD-088: Ego Channels

> Epic: [05 — Ego](../../epics/05-ego.md)
> Status: Not started

## Overview

Build the thin adapter layers that connect Ego Core (PRD-087) to different interfaces: MCP tools for Claude Code sessions, Moltbot skill for Telegram, and a CLI command. Each channel translates its native input/output format to and from the Ego conversation engine — the channels contain no business logic, only formatting and transport.

## API Surface

| Procedure / Tool         | Channel | Input                               | Output                             | Notes                               |
| ------------------------ | ------- | ----------------------------------- | ---------------------------------- | ----------------------------------- |
| `cerebrum.search`        | MCP     | query: string, scopes?: string[]    | `{ results: EngramRef[] }`         | Thalamus search exposed as MCP tool |
| `cerebrum.ingest`        | MCP     | body, title?, type?, scopes?, tags? | `{ engram: Engram }`               | Ingest pipeline exposed as MCP tool |
| `cerebrum.query`         | MCP     | question: string, scopes?: string[] | `{ answer: string, citations[] }`  | Natural language Q&A via Ego        |
| `cerebrum.engram.read`   | MCP     | id: string                          | `{ engram: Engram, body: string }` | Read a single engram                |
| `cerebrum.engram.write`  | MCP     | id: string, body: string, fields?   | `{ engram: Engram }`               | Update an existing engram           |
| Moltbot `/ask` skill     | Moltbot | text message                        | Telegram message with Markdown     | Quick query via Telegram            |
| Moltbot `/capture` skill | Moltbot | text message                        | Confirmation with engram link      | Quick capture via Telegram          |
| `pops ego "..."`         | CLI     | quoted string or piped stdin        | stdout (markdown, json, or plain)  | One-shot question from terminal     |

## Business Rules

- All channels delegate to the same Ego Core conversation engine — channel adapters handle format translation only
- MCP tools are registered via the localhost MCP server and are available to Claude Code sessions running on the same machine. Each tool has a JSON Schema description for parameter validation
- MCP tools operate statelessly — each call is a self-contained request. No conversation state is maintained between MCP tool calls (use `cerebrum.query` for Q&A, not multi-turn chat)
- Moltbot skills reuse the existing Moltbot skill registration pattern. The `/ask` skill creates a one-shot Ego query with `personal.*` default scope (configurable). The `/capture` skill calls `cerebrum.ingest.quickCapture`
- Moltbot responses are scope-aware — responses never include content from `.secret.` scopes. The default scope for Moltbot is `personal.*` unless the user specifies otherwise in the message
- The CLI command `pops ego "question"` creates a one-shot Ego query and prints the response to stdout. Output format is selectable: `--format markdown` (default), `--format json` (structured response with citations), `--format plain` (no Markdown formatting)
- CLI supports piped input: `cat notes.md | pops ego "summarise this"` — piped content is appended to the question as context
- CLI exit code is 0 on success, 1 on error. Errors print to stderr

## Edge Cases

| Case                                             | Behaviour                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| MCP tool called with invalid parameters          | Returns structured JSON error with field-level validation messages          |
| MCP `cerebrum.query` returns no relevant engrams | Returns answer based on general knowledge with empty citations array        |
| Moltbot message exceeds Telegram character limit | Response is split into multiple messages at Markdown-safe boundaries        |
| Moltbot `/capture` with empty text               | Returns error message: "Nothing to capture — send some text after /capture" |
| CLI with no arguments and no piped input         | Prints usage help and exits with code 1                                     |
| CLI response exceeds terminal width              | Markdown output wraps at terminal width; JSON output is not wrapped         |
| MCP server not running                           | Claude Code receives connection error — MCP tools are unavailable           |
| Moltbot service unavailable                      | Telegram messages queue on Telegram's side, processed when service recovers |

## User Stories

| #   | Story                                             | Summary                                                                        | Status      | Parallelisable |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------ | ----------- | -------------- |
| 01  | [us-01-mcp-tools](us-01-mcp-tools.md)             | MCP tool definitions for Claude Code: search, ingest, query, read, write       | Not started | Yes            |
| 02  | [us-02-moltbot-channel](us-02-moltbot-channel.md) | Moltbot skills for quick capture and query via Telegram                        | Not started | Yes            |
| 03  | [us-03-cli-interface](us-03-cli-interface.md)     | CLI command for one-shot questions with format options and piped input support | Not started | Yes            |

All three channels are independent adapters and can be built in parallel. Each depends on PRD-087 (Ego Core) being implemented.

## Verification

- A Claude Code session can call `cerebrum.search` via MCP and receive relevant engram references
- A Claude Code session can call `cerebrum.ingest` via MCP and a new engram file appears on disk
- A Claude Code session can call `cerebrum.query` via MCP and receive a grounded answer with engram citations
- Sending `/ask what do I know about LangGraph?` to Moltbot returns a response citing relevant engrams
- Sending `/capture Had a great idea about agent routing` to Moltbot creates a `capture` type engram
- Running `pops ego "what meetings do I have this week?"` prints a Markdown-formatted answer to stdout
- Running `pops ego "summarise" --format json` with piped input returns structured JSON with citations
- Moltbot responses never include `.secret.` scoped content
- MCP tools return structured errors for invalid inputs

## Out of Scope

- Ego Core conversation engine (PRD-087 — this PRD only defines the channel adapters)
- Shell chat panel (PRD-087 US-02 — tightly coupled to the conversation engine, defined there)
- Voice input/output transcription
- Third-party chat platform integrations beyond Telegram (future Plexus adapters)
- Multi-turn conversations via MCP (MCP tools are stateless single-shot calls)

## Drift Check

last checked: 2026-04-17

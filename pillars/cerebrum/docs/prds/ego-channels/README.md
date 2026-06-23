# Ego Channels

> Epic: [05 — Ego](../../epics/05-ego.md)
> Status: Partial — MCP exposes read-only knowledge tools (`cerebrum.search`, `cerebrum.engrams.list`, `cerebrum.engrams.get`) and the Telegram/Moltbot channel ships `/capture` + `/ask`; the MCP write/ingest/NL-query tools and the `pops ego` terminal CLI are not built (see ideas).

Thin adapter layers that let external surfaces talk to the cerebrum knowledge base and its Ego/query engine without embedding business logic. Each channel only translates its native input/output format to and from cerebrum's REST contract — retrieval, ingest, and Q&A all live in the cerebrum pillar (which owns the engrams, conversations, plexus and glia in its own SQLite DB).

Two channels are live today:

- **MCP** — the `mcp` pillar runs a Streamable-HTTP Model Context Protocol server so Claude Code (and other MCP clients) can search and read engrams mid-session.
- **Moltbot** — a Telegram bot (upstream `moltbot/moltbot` image) driven by a skill prompt that maps `/capture`, `/ask` and `/help` onto cerebrum REST calls.

## MCP channel

The `mcp` pillar (`pillars/mcp`) exposes an HTTP MCP endpoint at `POST /mcp` (Streamable-HTTP transport, stateless per request), plus `GET /health` and `GET /ready`. Tools from every pillar are aggregated; the cerebrum tools call the cerebrum pillar through the `@pops/pillar-sdk` `pillar('cerebrum')` client (authenticated with the MCP service-account `POPS_API_KEY`). Each tool ships a JSON-Schema `inputSchema` used by the client for discovery and validation.

| Tool                    | Input                                                                      | Backed by cerebrum endpoint   |
| ----------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| `cerebrum.search`       | `query` (required), `mode` (semantic\|structured\|hybrid=default), `limit` | `POST /retrieval/search`      |
| `cerebrum.engrams.list` | `search?`, `type?`, `scopes?`, `tags?`, `status?`, `limit?`, `offset?`     | `cerebrum.engrams.list` (SDK) |
| `cerebrum.engrams.get`  | `id` (required)                                                            | `cerebrum.engrams.get` (SDK)  |

Acceptance criteria:

- [x] An MCP client lists the three cerebrum tools with full JSON-Schema parameter descriptions.
- [x] `cerebrum.search` runs hybrid retrieval (default mode) and returns ranked results; an empty/whitespace `query` returns a structured tool error rather than throwing.
- [x] `cerebrum.engrams.get` with a missing/empty `id` returns a structured tool error; a valid `id` returns the engram's metadata and body.
- [x] Tool handler exceptions are caught and surfaced as `{ isError: true, content: [text] }` — stack traces never leak to the client.
- [x] The server only starts listening outside `NODE_ENV=test`; `/ready` reports `degraded` (503) when `POPS_API_KEY` is unset.

## Moltbot (Telegram) channel

The `moltbot` pillar (`pillars/moltbot`) ships config (`config/config.yml`, `config.dev.yml`), a one-shot `validate-config.sh` init container, and the `pops-cerebrum` skill prompt that the upstream bot image executes. The bot is single-tenant (allow-listed `telegram.allowed_user_ids`) and authenticates to cerebrum with a service-account API key (`X-API-Key`). Commands map to cerebrum REST as:

| Command           | cerebrum endpoint            | Notes                                                                              |
| ----------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `/capture <text>` | `POST /ingest/quick-capture` | Body `{ text, source: 'moltbot', scopes? }`; replies with the new engram id/title. |
| `/ask <question>` | `POST /query/ask`            | Default scope `personal.*`; reply carries the answer + citations.                  |
| `/help`           | —                            | Static command list.                                                               |
| follow-up find    | `POST /retrieval/search`     | Used when the user wants to list engrams rather than ask.                          |

Business rules / acceptance criteria:

- [x] Default scope for Moltbot is `personal.*` (enforced in cerebrum's per-channel scope negotiator: `moltbot → ['personal.']`). The user overrides per-message via `/scope <prefix> <command>` or an inline `<scope>:` prefix.
- [x] `.secret.*` content is never returned; a request for secret content is answered with a "open the shell" message.
- [x] `/capture` with no text replies "Send some text after /capture to save it." and stores nothing.
- [x] Answers include citations as Telegram-Markdown links to the shell (`[title](https://pops.local/cerebrum/<engram-id>)`); special characters in link text are escaped, not dropped.
- [x] Responses over Telegram's 4096-character limit are split at paragraph boundaries — never mid-word, never inside a link.
- [x] Upstream/auth failures map to human messages (401/403 → "auth failed, rotate the key"; 5xx → "currently unavailable"; timeout → "took too long") — raw responses are never surfaced.
- [x] The validator init container fails loudly (exit 1) on a missing secret, a `REPLACE_ME` placeholder, or an empty `allowed_user_ids`, so the bot never starts half-configured.

## Edge cases

| Case                                          | Behaviour                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| MCP tool called with invalid parameters       | Tool returns `{ isError: true }` text content with the field message           |
| MCP server cannot reach cerebrum / no API key | `/ready` is 503; tool calls surface the SDK error as `isError` content         |
| Unknown MCP tool name                         | `Unknown tool: <name>` with `isError: true`                                    |
| Moltbot message exceeds 4096 chars            | Split into multiple Telegram messages at safe boundaries                       |
| Moltbot `/ask` matches no engrams             | Low-confidence/empty-sources answer is prefixed with a "confirm in shell" note |
| Moltbot scope unknown                         | Falls back to `personal.*` and tells the user which scope was queried          |

## Out of scope

- Ego Core conversation engine and shell chat panel (see `../ego-core/README.md`).
- Voice input/output transcription.
- Chat platforms beyond Telegram (future Plexus adapters).
- MCP ingest/write/NL-query tools → see `docs/ideas/mcp-write-and-query-tools.md`.
- `pops ego` terminal CLI → see `docs/ideas/ego-cli.md`.

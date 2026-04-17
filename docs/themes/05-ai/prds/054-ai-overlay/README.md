# PRD-054: AI Overlay

> Epic: [01 — AI Overlay](../../epics/01-ai-overlay.md)
> Status: Superseded by [PRD-087 — Ego Core](../../../06-cerebrum/prds/087-ego-core/README.md)

## Overview

A contextual AI assistant integrated into the shell as a floating chat overlay. Knows which app the user is viewing (via PRD-058), can query and act across all domains via a verb-based command language, and streams responses token-by-token. Claude has full autonomy to execute actions — the permission system controls what's available, not confirmation dialogs.

## Trigger & UI

- **Floating button**: bottom-right corner, circular, always visible
- **Keyboard shortcut**: Cmd+. (period)
- **Chat panel**: anchored to bottom-right, ~400px wide, ~60vh tall, resizable
- **Messages**: user right-aligned, AI left-aligned, streaming token-by-token
- **Tool calls**: shown inline as compact status cards ("Searched transactions... 12 results")
- **Results with links**: clickable cards within the chat flow
- **Close**: X button, Escape, or click outside. Conversation persists when minimised
- **New chat**: button to start fresh conversation
- **Model selector**: dropdown in panel header — Sonnet (default), Haiku, Opus

## Streaming Architecture

SSE (Server-Sent Events) via a raw Express route at `/ai/chat`. Not tRPC — SSE needs a persistent connection that tRPC doesn't natively support.

```
POST /ai/chat
Content-Type: application/json
→ { conversationId?, message, context: SearchContext }

Response: text/event-stream
← event: token     data: { text: "Your" }
← event: token     data: { text: " Prusa" }
← event: tool_call data: { tool: "fetch", params: { uri: "pops:inventory/item/42" } }
← event: tool_result data: { ... }
← event: token     data: { text: "warranty expires..." }
← event: done      data: { usage: { inputTokens, outputTokens } }
```

Frontend reads the stream via `fetch` + `ReadableStream` (works in browsers and React Native).

## Command Language

Flat verb-based actions: `<domain>:<verb> { params }`.

```
media:add-to-library { tmdbId: 550 }
media:mark-watched { tmdbId: 550, watchedAt: "2026-04-01" }
media:add-to-watchlist { tmdbId: 550 }
media:request-download { tmdbId: 550 }
finance:search-transactions { entity: "Woolworths", since: "2026-03-01" }
inventory:create-item { name: "Keyboard", location: "Office Desk", assetId: "KB-003" }
```

Each verb maps to one or more tRPC calls behind the scenes. The AI never calls tRPC directly — only the command layer.

### Meta-tools (always available)

| Tool               | Purpose                                                                               | Visible to user?        |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------- |
| `help { domain }`  | Returns verb list for a domain. Used when Claude needs cross-domain tools             | No                      |
| `fetch { uri }`    | Retrieves data for AI reasoning. Returns data + contextual commands for that resource | No                      |
| `search { query }` | Cross-domain search (PRD-057). Returns results + per-result commands                  | No                      |
| `navigate { uri }` | Navigates the user's browser to a page                                                | Yes (browser navigates) |

### Lazy tool loading

System prompt includes only the current domain's verbs. Other domains listed as names only. When Claude needs tools from another domain, it calls `help { domain }` to discover them.

`fetch` and `search` return contextual commands alongside data — Claude discovers what it can do with a resource by fetching it.

```
fetch { uri: "pops:inventory/item/42" }
→ {
    data: { name: "Prusa MK4", warrantyExpires: "2027-06-15", ... },
    commands: [
      "inventory:update-item { id, name?, location?, ... }",
      "inventory:move-item { id, locationId }",
      "inventory:add-connection { id, targetId }"
    ]
  }
```

### Domain verb sets

**Finance:**

- Read: `search-transactions`, `get-transaction`, `get-budget-summary`, `get-wishlist`, `search-entities`, `get-entity`
- Write: `create-budget`, `update-budget`, `add-to-wishlist`, `remove-from-wishlist`, `create-entity`

**Media:**

- Read: `search-library`, `get-movie`, `get-tv-show`, `get-watch-history`, `get-rankings`
- Write: `add-to-library`, `add-to-watchlist`, `mark-watched`, `request-download`

**Inventory:**

- Read: `search-items`, `get-item`, `get-location-tree`, `get-connections`
- Write: `create-item`, `update-item`, `move-item`, `add-connection`

**AI:**

- Read: `get-usage-stats`, `get-model-config`, `get-cache-stats`

### Permissions

Each verb has an allowed-consumers list. v1: all verbs allowed for the AI overlay. Future: mobile app and Moltbot get their own permission sets. Destructive verbs (delete, blacklist, purge) are not in any domain's verb set — they're intentionally excluded from the command language.

## Conversation Memory

- Conversations persisted to SQLite, auto-expire after 24 hours
- Can close panel, navigate around, reopen — conversation continues
- Context snapshot captured at conversation start (app, page, entity)
- "New chat" starts fresh with current context

### Schema

**ai_conversations**

| Column             | Type    | Description                                   |
| ------------------ | ------- | --------------------------------------------- |
| `id`               | INTEGER | PK, auto-increment                            |
| `context_snapshot` | TEXT    | JSON: app, page, entity at conversation start |
| `model`            | TEXT    | Claude model used                             |
| `started_at`       | TEXT    | ISO timestamp                                 |

**ai_messages**

| Column            | Type    | Description                                     |
| ----------------- | ------- | ----------------------------------------------- |
| `id`              | INTEGER | PK, auto-increment                              |
| `conversation_id` | INTEGER | FK → ai_conversations                           |
| `role`            | TEXT    | "user", "assistant", "tool_call", "tool_result" |
| `content`         | TEXT    | Message text or JSON for tool calls/results     |
| `created_at`      | TEXT    | ISO timestamp                                   |

Cleanup: conversations older than 24h deleted on API startup.

## System Prompt Structure

```
You are POPS, a personal operations assistant. You help the user manage
their finances, media library, and home inventory.

The user is currently viewing: {app} > {page} > {entity}
{If entity: brief entity summary from fetch}

Available domains: finance, media, inventory, ai
Use `help { domain: "..." }` to see commands for other domains.

Commands for {current domain}:
- {verb list with param signatures}

When you fetch or search for data, the response includes commands
available for each result. Use those to take actions.

Use `navigate` when the user asks to go somewhere.
Use `fetch` silently when you need data to answer a question.
```

## Error Handling

| Error                      | UX                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Claude API down            | "AI is temporarily unavailable. Try again in a moment." + retry button                    |
| Rate limited               | "Please wait {N} seconds before sending another message." + countdown                     |
| Tool call fails            | Inline error card: "Failed to search transactions: {reason}". Claude can retry or explain |
| Streaming interrupted      | "Connection lost. Retry?" button re-sends the last message                                |
| Conversation expired (24h) | "This conversation has expired. Starting a new one." + auto-new-chat                      |

## Business Rules

- Model defaults to Sonnet. User can switch via dropdown (Haiku, Sonnet, Opus). Selection persists per session
- AI usage tracked via existing AI usage system (PRD-052) — each conversation records model, tokens, cost
- Context updates live — if the user navigates while chat is open, the AI's awareness updates on the next message
- Tool calls are logged in ai_messages as role "tool_call" and "tool_result" for conversation history
- No destructive verbs exist in the command language. The AI cannot delete, blacklist, or purge
- Conversations are single-user, single-session. No shared conversations
- Streaming responses can be interrupted by sending a new message (cancels the in-flight stream)

## Edge Cases

| Case                                  | Behaviour                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| User switches model mid-conversation  | Next message uses new model, conversation context preserved                                     |
| Tool call returns empty results       | Claude explains "I couldn't find any {thing}" naturally                                         |
| User asks about domain with no data   | Claude responds helpfully: "You don't have any inventory items yet. Want to add some?"          |
| Very long conversation (50+ messages) | Older messages truncated from Claude context, most recent 20 kept + summary of earlier messages |
| User navigates during streaming       | Stream continues, context updates on next message                                               |
| Panel opened with no context (root /) | System prompt shows "You are on the POPS home page" — all domains available                     |

## User Stories

| #   | Story                                                               | Summary                                                                                                         | Status      | Parallelisable                 |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------ |
| 01  | [us-01-command-language](us-01-command-language.md)                 | Verb registry, domain verb definitions, param schemas, permission system                                        | Not started | Yes                            |
| 02  | [us-02-command-executor](us-02-command-executor.md)                 | Execute verbs by mapping to tRPC calls, return data + contextual commands                                       | Not started | Blocked by us-01               |
| 03  | [us-03-meta-tools](us-03-meta-tools.md)                             | help, fetch, search, navigate — the 4 always-available tools                                                    | Not started | Blocked by us-01               |
| 04  | [us-04-conversation-schema](us-04-conversation-schema.md)           | ai_conversations + ai_messages tables, 24h expiry, context snapshot                                             | Not started | Yes                            |
| 05  | [us-05-sse-endpoint](us-05-sse-endpoint.md)                         | POST /ai/chat SSE streaming endpoint, Claude API integration, tool execution loop                               | Not started | Blocked by us-02, us-03, us-04 |
| 06  | [us-06-system-prompt](us-06-system-prompt.md)                       | Context-aware system prompt builder with lazy tool loading                                                      | Not started | Blocked by us-03               |
| 07  | [us-07-finance-verbs](us-07-finance-verbs.md)                       | Finance domain verb implementations (search, get, create, update for transactions, budgets, entities, wishlist) | Not started | Blocked by us-01               |
| 08  | [us-08-media-verbs](us-08-media-verbs.md)                           | Media domain verb implementations (search, get, add-to-library, watchlist, mark-watched, request-download)      | Not started | Blocked by us-01               |
| 09  | [us-09-inventory-verbs](us-09-inventory-verbs.md)                   | Inventory domain verb implementations (search, get, create, update, move, connect)                              | Not started | Blocked by us-01               |
| 10  | [us-10-chat-panel-ui](us-10-chat-panel-ui.md)                       | Floating button, chat overlay, message list, input, close/minimise, model selector                              | Not started | Yes                            |
| 11  | [us-11-streaming-renderer](us-11-streaming-renderer.md)             | SSE stream consumption, token-by-token rendering, tool call cards, result links                                 | Not started | Blocked by us-05, us-10        |
| 12  | [us-12-conversation-persistence](us-12-conversation-persistence.md) | Load/save conversation on panel open/close, new chat button, expiry handling                                    | Not started | Blocked by us-04, us-10        |
| 13  | [us-13-usage-tracking](us-13-usage-tracking.md)                     | Record model, tokens, cost per conversation via PRD-052 AI usage system                                         | Not started | Blocked by us-05               |

US-01, US-04, US-10 can start in parallel. US-07, US-08, US-09 (domain verbs) can parallelise after US-01.

## Out of Scope

- Proactive monitoring and alerts (PRD-055)
- Voice input
- Multi-user conversations
- Persistent conversation history beyond 24h
- AI-initiated messages (assistant always responds, never initiates)
- Image/file upload in chat (future: receipt photos)

## Drift Check

last checked: 2026-04-17

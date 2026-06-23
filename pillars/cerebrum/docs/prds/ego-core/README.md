# Ego Core

> Status: Partial — chat engine, scope negotiation, context awareness, persistence and the shell chat panel all ship. Two gaps deferred to [ideas/ego-recent-actions-and-history-summarisation](../../ideas/ego-recent-actions-and-history-summarisation.md): recent-action context, and wiring history summarisation into the live chat path (the method exists but only truncation runs today).

Ego is the conversational "I" of cerebrum: a multi-turn chat engine grounded in the pillar's own engram retrieval. Each turn negotiates scopes, retrieves relevant engrams via hybrid search, assembles a context window, calls the LLM, parses citations, and persists the exchange. Conversations, messages, and context links live in the cerebrum pillar's own SQLite DB alongside engrams, plexus, and glia. The shell chat panel (a React surface in `@pops/overlay-ego`, mounted at the cerebrum app `chat` route) is the primary channel; other channels (MCP, Moltbot, CLI) are out of scope here.

## Data Model

All tables live in the cerebrum pillar SQLite DB.

**conversations** — `id` (TEXT PK, `conv_{yyyymmdd_hhmmss}_{8hex}`), `title` (TEXT, nullable — auto-set on first user message), `active_scopes` (TEXT, JSON array), `app_context` (TEXT, JSON nullable), `model` (TEXT NOT NULL), `created_at`, `updated_at` (TEXT ISO 8601 NOT NULL). Indexed on `created_at` and `updated_at`.

**messages** — `id` (TEXT PK, `msg_{yyyymmdd_hhmmss}_{8hex}`), `conversation_id` (TEXT FK → conversations, ON DELETE CASCADE), `role` (TEXT: `user` | `assistant` | `system`), `content` (TEXT Markdown), `citations` (TEXT JSON array of engram IDs, nullable), `tool_calls` (TEXT JSON, nullable), `tokens_in`, `tokens_out` (INTEGER nullable), `created_at` (TEXT ISO NOT NULL). Composite index on `(conversation_id, created_at)`.

**conversation_context** — junction of engrams loaded into a conversation: `conversation_id` (TEXT FK → conversations, CASCADE), `engram_id` (TEXT), `relevance_score` (REAL nullable), `loaded_at` (TEXT ISO NOT NULL). Composite PK `(conversation_id, engram_id)`; additive across turns (upserted, never removed mid-conversation).

## REST API Surface

ts-rest contract `rest-ego.ts`, mounted under `/ego`. SSE cannot be modelled in ts-rest, so the streaming endpoint is a plain Express route mounted before the ts-rest endpoints.

| Endpoint                             | Body / Params                                                                | Returns                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `POST /ego/conversations`            | `{ title?, scopes?, appContext?, model }`                                    | `{ conversation }`                                                            |
| `POST /ego/conversations/search`     | `{ limit?, offset?, search? }`                                               | `{ conversations[], total }`                                                  |
| `GET /ego/conversations/:id`         | —                                                                            | `{ conversation, messages[] }`                                                |
| `DELETE /ego/conversations/:id`      | —                                                                            | `{ success: true }`                                                           |
| `POST /ego/conversations/:id/scopes` | `{ scopes[] }`                                                               | `{ scopes[] }`                                                                |
| `GET /ego/conversations/:id/context` | —                                                                            | `{ scopes, appContext, engrams[] }`                                           |
| `POST /ego/chat`                     | `{ conversationId?, message, scopes?, appContext?, channel?, knownScopes? }` | `{ conversationId, response, retrievedEngrams[], scopeNegotiation }`          |
| `POST /ego/chat/stream` (SSE)        | same body as chat                                                            | `text/event-stream`: `token` frames, then a `done` frame, or an `error` frame |

`appContext` is `{ app, route?, entityId?, entityType? }`. `channel` is `shell | moltbot | mcp | cli` (defaults `shell`).

## Business Rules

- **Pipeline per turn**: scope negotiation → scope biasing from app context → retrieval (hybrid search over engrams, scoped) → context-window assembly → LLM call → citation parse → persist. The user turn is persisted before streaming; the assistant turn and `conversation_context` upserts after the `done` event.
- **Context window priority**: (1) system prompt (cerebrum capabilities + active scopes + app context), (2) most-recent N history turns (default 20), (3) retrieved engram context block. Retrieved engrams are token-budgeted (default 4096) by the context assembler, lowest-relevance dropped first. Top-K retrieval defaults to 5 with a 0.3 relevance threshold.
- **Grounding & citations**: retrieved engrams are injected as a delimited "Retrieved knowledge" block. After the LLM responds, cited engram IDs are parsed out of the content and stored in `messages.citations`; `tokens_in`/`tokens_out` are recorded from LLM metadata.
- **Auto-title**: on the first user message (when title is null and user-message count is 1), the title is derived from the content — Markdown noise stripped, truncated to 80 chars at a word boundary.
- **Viewed-engram auto-load**: when `appContext.entityType === 'engram'`, the viewed engram is loaded into context with score 1.0 regardless of whether retrieval would have found it.
- **App-context scope biasing** (additive, not exclusive): the active app adds relevant scope prefixes — `finance → personal.finance`, `media → personal.media`, `inventory → personal.inventory`, `ai → personal.ai + work.ai`, `cerebrum → none`.
- **Scope negotiation** (best-effort, ordered): explicit "only personal/work" override → work/personal phrase detection → known-scope-by-name match (narrows to that scope + descendants) → work/personal keyword detection → channel default. Channel defaults: shell/cli → all non-secret scopes; moltbot → `personal.*`; mcp → `work.*`. Explicit overrides always win over inference. Scope changes apply from the next retrieval onward, never retroactively.
- **Secret hard block**: scopes containing a `secret` segment are never inferred or auto-added. Retrieval only sets `includeSecret` when the active scopes already contain a secret scope. A message that merely _mentions_ sensitive content yields a notice ("Secret scopes are excluded unless you explicitly ask…") without unlocking; an explicit unlock phrase ("include my secret notes") is required to widen to the full pool.
- **Scope-change transparency**: when negotiation changes scopes, the response is prefixed with an italic notice explaining the change (e.g. "Narrowed to work scopes based on conversation content").

## Edge Cases

| Case                                    | Behaviour                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Retrieval fails                         | Engine logs a warning and continues with no engram context rather than erroring the turn                                   |
| No engrams match                        | LLM answers from general knowledge; no citations                                                                           |
| User switches apps mid-conversation     | `appContext` on the next turn updates scope biasing and the system prompt                                                  |
| Streaming client disconnect             | Loop breaks on `req.close`; a placeholder/partial assistant message is persisted                                           |
| Mid-stream LLM failure                  | A placeholder assistant message is persisted and an `error` frame is emitted                                               |
| Conversation exceeds the history window | Older turns are **truncated** to the most recent N (summarisation into a condensed block is not yet wired — see idea file) |
| `.secret.*` content                     | Never retrieved unless the active scopes explicitly include a secret scope                                                 |

## Shell Chat Panel

React surface in `@pops/overlay-ego` (`ChatPanel` + `useChatPageModel`), mounted at the cerebrum app `chat` route via `ChatPage`.

- Composes `ConversationList` (sorted recent-first, title search, "new conversation", delete with confirm), `MessageThread`, `ChatInput`, and `ContextIndicator`.
- Streaming via `useStreamingChat` against `POST /ego/chat/stream`: `MessageThread` renders a `TypingIndicator` before the first token and a `StreamingBubble` accumulating tokens; assistant content renders Markdown.
- Each assistant message renders its cited engram IDs as `CitationLink`s into the engram detail view.
- `ContextIndicator` shows active scopes and the context-engram count, expandable to list context engrams with relevance scores.

## Acceptance Criteria

- [x] A `ConversationEngine` manages the lifecycle: create, append user message, generate assistant response, retrieve history.
- [x] Each user message triggers scoped hybrid retrieval (top-K default 5) and injects engram content as a delimited grounded block.
- [x] Context window follows the system-prompt → history → retrieval priority; retrieval is token-budgeted and trimmed by lowest relevance.
- [x] Responses stream over SSE (`token` → `done` / `error` frames); cited engram IDs and token counts are persisted on the message.
- [x] Citations are parsed from the response and stored in `messages.citations`.
- [x] `conversations` / `messages` / `conversation_context` schema matches the data model above with cascade delete.
- [x] `POST /ego/conversations` creates a row (title null until first message); `/search` lists by `updated_at` desc with pagination + title search; `GET /:id` returns messages ascending; `DELETE /:id` cascades messages + context in one transaction.
- [x] Each chat turn appends user + assistant messages, bumps `updated_at`, and upserts `conversation_context` for newly retrieved engrams.
- [x] Auto-title from the first user message: Markdown-cleaned, ≤80 chars at a word boundary.
- [x] App context (`{ app, route?, entityId?, entityType? }`) is persisted on the conversation, drives additive scope biasing, and the viewed engram auto-loads at score 1.0.
- [x] `GET /ego/conversations/:id/context` returns active scopes, app context, and context engrams with relevance scores.
- [x] Scope negotiation infers scopes from explicit overrides, phrases, known-scope mentions, keywords, and channel defaults; explicit overrides win; changes apply forward-only and are surfaced to the user.
- [x] `.secret` scopes are never inferred or auto-added; only an explicit unlock phrase or `setScopes` widens to secret scopes.
- [x] When no scopes are determinable, the conversation defaults to all non-secret scopes (shell/cli channel default).
- [x] Shell chat panel: conversation list (search, new, delete-with-confirm), streaming thread with typing indicator, Markdown rendering, clickable citations, and an expandable context indicator with scopes + engram relevance.
- [ ] Recent user actions summarised into context — deferred (idea file).
- [ ] Older history summarised into a condensed system block instead of truncated — `summariseHistory` exists but is unwired; deferred (idea file).

## Out of Scope

- Non-shell channels (MCP, Moltbot, CLI), autonomous/reflex actions, voice I/O, multi-user conversations, user-editable system prompts.

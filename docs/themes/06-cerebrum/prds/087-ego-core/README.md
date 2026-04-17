# PRD-087: Ego Core

> Epic: [05 — Ego](../../epics/05-ego.md)
> Status: Not started
> Supersedes: PRD-054 (AI Overlay)

## Overview

Build the conversational agent core — the "I" of the system. Ego manages multi-turn conversations grounded in Cerebrum retrieval, delegates to Thalamus for knowledge retrieval, to Emit for output production, and can trigger Ingest to write new engrams during conversation. This PRD defines the conversation engine, context management (app awareness, active engrams), scope negotiation (determining which scopes are relevant to the current conversation), and conversation persistence in SQLite. The channels that surface Ego (shell panel, MCP, Moltbot, CLI) are defined in PRD-088.

## Data Model

### conversations

| Column        | Type | Constraints | Description                                                  |
| ------------- | ---- | ----------- | ------------------------------------------------------------ |
| id            | TEXT | PK          | Conversation ID: `conv_{timestamp}_{short_hash}`             |
| title         | TEXT |             | User-set or auto-generated from first message                |
| active_scopes | TEXT |             | JSON array of scope strings active for this conversation     |
| app_context   | TEXT |             | JSON — which pops app, route, or entity the user was viewing |
| model         | TEXT | NOT NULL    | LLM model used for this conversation                         |
| created_at    | TEXT | NOT NULL    | ISO 8601                                                     |
| updated_at    | TEXT | NOT NULL    | ISO 8601                                                     |

**Indexes:** `created_at`, `updated_at`

### messages

| Column          | Type    | Constraints                     | Description                                     |
| --------------- | ------- | ------------------------------- | ----------------------------------------------- |
| id              | TEXT    | PK                              | Message ID: `msg_{timestamp}_{short_hash}`      |
| conversation_id | TEXT    | FK → conversations.id, NOT NULL | Parent conversation                             |
| role            | TEXT    | NOT NULL                        | `user`, `assistant`, `system`                   |
| content         | TEXT    | NOT NULL                        | Message content (Markdown)                      |
| citations       | TEXT    |                                 | JSON array of engram IDs cited in this response |
| tool_calls      | TEXT    |                                 | JSON array of tool calls made during this turn  |
| tokens_in       | INTEGER |                                 | Input token count for this turn                 |
| tokens_out      | INTEGER |                                 | Output token count for this turn                |
| created_at      | TEXT    | NOT NULL                        | ISO 8601                                        |

**Indexes:** `conversation_id` + `created_at` composite

### conversation_context

| Column          | Type | Constraints                     | Description                                         |
| --------------- | ---- | ------------------------------- | --------------------------------------------------- |
| conversation_id | TEXT | FK → conversations.id, NOT NULL | Parent conversation                                 |
| engram_id       | TEXT | NOT NULL                        | Engram ID loaded into context                       |
| relevance_score | REAL |                                 | Thalamus retrieval score                            |
| loaded_at       | TEXT | NOT NULL                        | ISO 8601 — when this engram was loaded into context |

**Indexes:** `conversation_id`, `engram_id`

## API Surface

| Procedure                  | Input                                    | Output                                         | Notes                                       |
| -------------------------- | ---------------------------------------- | ---------------------------------------------- | ------------------------------------------- |
| `ego.conversations.create` | title?, scopes?, appContext?             | `{ conversation: Conversation }`               | Start a new conversation                    |
| `ego.conversations.list`   | limit?, offset?, search?                 | `{ conversations: Conversation[], total }`     | List conversations, searchable by title     |
| `ego.conversations.get`    | conversationId                           | `{ conversation, messages: Message[] }`        | Get conversation with full message history  |
| `ego.conversations.delete` | conversationId                           | `{ success: boolean }`                         | Delete conversation and all messages        |
| `ego.chat`                 | conversationId, message: string, scopes? | `{ response: Message }` (streaming)            | Send a message, receive a streamed response |
| `ego.context.getActive`    | conversationId                           | `{ scopes, appContext, engrams: EngramRef[] }` | Current context state for the conversation  |
| `ego.context.setScopes`    | conversationId, scopes: string[]         | `{ scopes: string[] }`                         | Explicitly set active scopes                |

## Business Rules

- Ego maintains a system prompt that describes the user's Cerebrum capabilities: what engrams are, how scopes work, what Ego can do (search, retrieve, ingest, generate). The system prompt is augmented with the current conversation's active scopes and app context
- On each user message, Ego queries Thalamus for relevant engrams using the message content as a search query, scoped to the conversation's active scopes. Retrieved engrams are injected into the context window as grounded references
- Context window management follows a priority hierarchy: (1) system prompt, (2) conversation history (most recent N messages, configurable), (3) active engram context, (4) retrieved engrams for the current query. When the total exceeds the model's context limit, retrieved engrams are truncated by relevance score (lowest first)
- Ego can trigger actions during conversation: `cerebrum.ingest.submit` to write a new engram from conversation content, `cerebrum.engrams.link` to connect referenced engrams, `cerebrum.retrieval.search` to find additional context
- Responses include citations — when Ego references content from a specific engram, the engram ID is included in the `citations` array on the message record
- Conversation titles are auto-generated from the first user message (first 80 characters, cleaned) if not explicitly provided
- Conversations are scoped — the `active_scopes` field determines which engrams are searchable. Scopes can be set explicitly or inferred from context
- Engrams with `.secret.` scope segments are never retrieved unless the conversation's active scopes explicitly include the exact `.secret.*` scope

## Edge Cases

| Case                                                 | Behaviour                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation context exceeds model token limit       | Oldest messages are summarised into a condensed history block, freeing token budget for retrieved engrams                                |
| No engrams match the user's query                    | Ego responds based on general knowledge with a note that no matching engrams were found                                                  |
| User asks Ego to write an engram during conversation | Ego calls `cerebrum.ingest.submit` with the content, confirms creation, and adds the new engram to the conversation context              |
| User switches pops apps mid-conversation             | App context is updated on the next message — Ego adjusts retrieval accordingly                                                           |
| Conversation references engrams across scopes        | Only engrams within active scopes are retrievable — Ego explains if a referenced topic falls outside active scopes                       |
| User explicitly mentions a scope ("at work")         | Scope negotiation detects the mention and adjusts active scopes for subsequent retrieval                                                 |
| Streaming response interrupted by client disconnect  | Partial response is saved to messages table — next message resumes the conversation                                                      |
| Conversation has 100+ messages                       | Only the most recent 20 messages (configurable) are included in context; older messages available via scrollback but not sent to the LLM |

## User Stories

| #   | Story                                                               | Summary                                                                                | Status      | Parallelisable   |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------- | ---------------- |
| 01  | [us-01-conversation-engine](us-01-conversation-engine.md)           | Multi-turn conversation management: history, context window, system prompt             | Not started | No (first)       |
| 02  | [us-02-shell-chat-panel](us-02-shell-chat-panel.md)                 | React component in pops-shell: streaming responses, message history, conversation list | Not started | Blocked by us-01 |
| 03  | [us-03-context-awareness](us-03-context-awareness.md)               | App-aware context: current pops app, recent actions, active engram context             | Not started | Blocked by us-01 |
| 04  | [us-04-scope-negotiation](us-04-scope-negotiation.md)               | Infer scopes from conversation: explicit mentions, topic inference, channel defaults   | Not started | Blocked by us-01 |
| 05  | [us-05-conversation-persistence](us-05-conversation-persistence.md) | SQLite persistence: conversations, messages, context metadata                          | Not started | Yes              |

US-01 (conversation engine) is the foundation. US-02, US-03, and US-04 depend on it. US-05 (persistence) can be built in parallel since it defines the storage schema independently.

## Verification

- A new conversation can be started from the shell chat panel with an auto-generated title
- Sending a message triggers Thalamus retrieval and the response cites relevant engrams by ID
- Asking "what do I know about X" returns a grounded answer pulling from matching engrams within the active scopes
- Asking Ego to "save this as an engram" during conversation creates a new engram via the ingest pipeline
- Scope negotiation detects "at work" in a message and restricts subsequent retrieval to `work.*` scopes
- Conversations persist across page refreshes — reopening a conversation shows full message history
- Context window management does not crash on conversations exceeding 100 messages
- `.secret.*` engrams are never retrieved unless explicitly scoped in
- The system prompt accurately reflects the conversation's active scopes and app context

## Out of Scope

- Channel-specific interfaces (PRD-088 — shell panel is in US-02 here as it's tightly coupled to the conversation engine, but MCP/Moltbot/CLI channels are in PRD-088)
- Autonomous actions without user prompt (PRD-089 — Reflex System)
- Voice input/output
- Multi-user conversations or shared contexts
- Custom system prompt editing by the user (future)

## Drift Check

last checked: never

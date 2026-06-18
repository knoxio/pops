# US-05: Conversation Persistence

> PRD: [PRD-087: Ego Core](README.md)
> Status: Done

## Description

As a user, I want my conversations with Ego to be saved and resumable so that I can continue a discussion from where I left off and browse my conversation history.

## Acceptance Criteria

- [x] A Drizzle schema defines the `conversations` table with columns: `id` (TEXT PK), `title` (TEXT), `active_scopes` (TEXT, JSON array), `app_context` (TEXT, JSON), `model` (TEXT NOT NULL), `created_at` (TEXT NOT NULL), `updated_at` (TEXT NOT NULL)
- [x] A Drizzle schema defines the `messages` table with columns: `id` (TEXT PK), `conversation_id` (TEXT FK NOT NULL), `role` (TEXT NOT NULL), `content` (TEXT NOT NULL), `citations` (TEXT, JSON array), `tool_calls` (TEXT, JSON array), `tokens_in` (INTEGER), `tokens_out` (INTEGER), `created_at` (TEXT NOT NULL)
- [x] A Drizzle schema defines the `conversation_context` table with columns: `conversation_id` (TEXT FK NOT NULL), `engram_id` (TEXT NOT NULL), `relevance_score` (REAL), `loaded_at` (TEXT NOT NULL) — composite PK on `(conversation_id, engram_id)`
- [x] `ego.conversations.create` inserts a new conversation row and returns it — title defaults to null (set on first message)
- [x] `ego.conversations.list` returns conversations sorted by `updated_at` descending with pagination — supports text search on `title`
- [x] `ego.conversations.get` returns the conversation with all associated messages ordered by `created_at` ascending
- [x] `ego.conversations.delete` deletes the conversation, all associated messages, and all context entries in a single transaction
- [x] Each `ego.chat` call appends the user message and assistant response to the `messages` table, updates `conversation.updated_at`, and upserts `conversation_context` entries for any newly retrieved engrams
- [x] Conversation title is auto-generated from the first user message: first 80 characters cleaned of Markdown formatting, truncated at the nearest word boundary

## Notes

- The persistence layer should be a thin service (`src/modules/ego/persistence.ts`) that the conversation engine calls after each turn — persistence should not be entangled with the conversation logic.
- Token counts are stored per-message for future analysis (cost tracking, context budget monitoring) but are not currently surfaced in any UI.
- The `conversation_context` table is additive — engrams are added as they are retrieved across turns but never removed during a conversation. This gives a full picture of what knowledge influenced the conversation.
- Consider adding a `summarised_history` TEXT column to the `conversations` table later for storing compressed older messages — not needed for initial implementation.

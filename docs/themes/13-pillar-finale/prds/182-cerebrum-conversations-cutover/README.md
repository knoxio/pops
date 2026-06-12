# PRD-182: cerebrum.conversations cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `cerebrum.conversations.*` procedures + the `conversations` and `conversation_messages` tables into `cerebrum.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

Conversations are chat-with-cerebrum sessions: stored prompts, model responses, references to engrams, action proposals. Append-only message stream per conversation; minimal mutation surface.

## Data Model

Tables (move from shared to `packages/cerebrum-db`):

- `conversations` — { id, title, started_at, ended_at, primary_intent, summary }
- `conversation_messages` — { id, conversation_id (FK CASCADE), role ('user' | 'assistant' | 'system' | 'tool'), content_text, content_json, created_at, model, tokens_in, tokens_out }
- `conversation_engram_refs` — { conversation_id, message_id, engram_id, ref_type ('cited' | 'created' | 'updated') } (join table to engrams from PRD-179)

## API Surface

| Procedure                                | Kind     |
| ---------------------------------------- | -------- |
| `cerebrum.conversations.list`            | query    |
| `cerebrum.conversations.get`             | query    |
| `cerebrum.conversations.start`           | mutation |
| `cerebrum.conversations.append`          | mutation |
| `cerebrum.conversations.end`             | mutation |
| `cerebrum.conversations.summarise`       | mutation |
| `cerebrum.conversations.engramRefs.list` | query    |

Slice doesn't yet exist as a separate `apps/pops-api/src/modules/cerebrum/conversations/` directory — currently conversations are handled inline in cerebrum's chat surface. PRD-182's PR 1 includes carving out the module.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- The chat surface is intensively-write (messages stream in during conversation). The cutover happens between conversations to avoid mid-stream handle switching.
- Engram references gated on PRD-179 (engrams).

## Edge Cases

| Case                                              | Behaviour                                                                                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Active conversation when cutover deploys          | Watchtower deploy windows are off-hours; risk is small. If it happens, the conversation completes; the next message lands via the new handle. |
| Engram reference to an engram that's been deleted | Soft reference; UI handles.                                                                                                                   |
| Conversation summary generation hits AI Ops API   | Stays as-is (AI Ops is a separate concern).                                                                                                   |

## User Stories

| #   | Story                                                       | Summary                                                                                  |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Carve out the conversations module; add schemas + services to `@pops/cerebrum-db` |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                                                          |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip routers to `getCerebrumDrizzle()`                                            |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                                                              |

## Out of Scope

- Chat UI changes.
- AI model selection / routing.
- Cross-conversation memory ("remember from previous session" — handled by engrams).
- Conversation export / archival.

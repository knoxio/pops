# US-04: Conversation persistence schema

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As the system, I persist conversations to SQLite so the user can close and reopen the chat panel without losing context.

## Acceptance Criteria

- [ ] `ai_conversations` table: id, context_snapshot (JSON), model, started_at
- [ ] `ai_messages` table: id, conversation_id (FK), role (user/assistant/tool_call/tool_result), content, created_at
- [ ] Conversations older than 24h deleted on API startup
- [ ] `createConversation(contextSnapshot, model)` returns conversation ID
- [ ] `addMessage(conversationId, role, content)` appends a message
- [ ] `getConversation(id)` returns conversation with all messages
- [ ] `getActiveConversation()` returns most recent non-expired conversation (if any)
- [ ] Tests: create, add messages, retrieve, expiry cleanup

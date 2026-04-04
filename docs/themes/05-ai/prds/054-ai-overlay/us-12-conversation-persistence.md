# US-12: Conversation persistence

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As a user, I want my chat conversation to persist when I close the panel or navigate so I can pick up where I left off.

## Acceptance Criteria

- [ ] On panel open: load most recent non-expired conversation (if any)
- [ ] Messages displayed from persisted history
- [ ] New messages appended to the same conversation
- [ ] "New chat" creates a new conversation with current context snapshot
- [ ] On expiry (24h): show "This conversation has expired" and auto-create new
- [ ] Conversation ID stored in session (Zustand or sessionStorage)
- [ ] Tests: load existing, new chat, expiry handling

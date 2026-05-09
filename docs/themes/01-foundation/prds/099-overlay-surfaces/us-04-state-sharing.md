# US-04: Shared state between overlay and route

> PRD: [Overlay Surfaces](README.md)
> Status: In progress

## Description

As a user, I want the overlay and `/cerebrum/chat` to share conversation **data** so that messages sent on one surface are visible on the other, without standing up a duplicate store.

## Acceptance Criteria

- [ ] Both surfaces consume `useChatPageModel` from `@pops/overlay-ego`.
- [ ] Conversation list and message history are sourced from the same tRPC queries (`ego.conversations.list`, `ego.conversations.get`); React Query's per-key cache is the synchronisation layer.
- [ ] No Zustand or React Context "chat store" is introduced in the shell or in app-cerebrum.
- [ ] A new message sent from one surface is visible on the other on the next React Query refresh (the per-conversation thread is invalidated on success).
- [ ] The active **selected conversation** is intentionally not shared across surfaces in this PRD — each surface owns its own `selectedConversationId` local state. Cross-surface selection sharing (URL param, persisted preference) is out of scope and tracked separately.

## Notes

- React Query's per-key cache provides the shared state. Both consumers query the same keys.
- The conversation-id selection is local component state in `useChatPageModel`; the model is recreated per surface but operates on the same tRPC data.

# US-04: Shared state between overlay and route

> PRD: [Overlay Surfaces](README.md)
> Status: In progress

## Description

As a user, I want the overlay and `/cerebrum/chat` to share conversation state so that selecting a conversation in one surface shows the same context in the other without duplicate stores.

## Acceptance Criteria

- [ ] Both surfaces consume `useChatPageModel` from `@pops/overlay-ego`.
- [ ] Conversation list, selected conversation, and message history are sourced from the same tRPC queries (`ego.conversations.list`, `ego.conversations.get`).
- [ ] No Zustand or React Context "chat store" is introduced in the shell or in app-cerebrum.
- [ ] A new message sent from the overlay appears in `/cerebrum/chat` (and vice versa) within the next React Query refresh.

## Notes

- React Query's per-key cache provides the shared state. Both consumers query the same keys.
- The conversation-id selection is local component state in `useChatPageModel`; the model is recreated per surface but operates on the same tRPC data.

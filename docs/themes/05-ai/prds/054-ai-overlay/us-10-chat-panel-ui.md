# US-10: Chat panel UI

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As a user, I want a floating chat panel accessible from anywhere in the app so I can ask questions and give commands.

## Acceptance Criteria

- [ ] Floating circular button, bottom-right corner, above scroll-to-top
- [ ] Cmd+. keyboard shortcut opens/closes the panel
- [ ] Panel: ~400px wide, ~60vh tall, anchored bottom-right
- [ ] Resize handle (drag to adjust height)
- [ ] Message list: user messages right-aligned, AI messages left-aligned
- [ ] Text input at bottom with send button
- [ ] Model selector dropdown in panel header (Sonnet default, Haiku, Opus)
- [ ] Close via X button, Escape, or click outside
- [ ] Panel state preserved when minimised (messages stay)
- [ ] "New chat" button in header
- [ ] Mobile: panel becomes full-screen overlay
- [ ] Tests: open/close, keyboard shortcut, model selector, mobile layout

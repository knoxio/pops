# US-11: Streaming response renderer

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As a user, I want to see Claude's response appear token-by-token with tool calls shown as inline cards so the chat feels responsive and transparent.

## Acceptance Criteria

- [ ] Consumes SSE stream from POST /ai/chat via fetch + ReadableStream
- [ ] `token` events append text to the current assistant message in real-time
- [ ] `tool_call` events render as a compact inline card: tool name + summary of params
- [ ] `tool_result` events update the card with result summary (e.g. "Found 12 transactions")
- [ ] `done` event finalises the message
- [ ] Clickable links in results (rendered as cards) navigate via URI resolver
- [ ] Error events show inline error with retry button
- [ ] Auto-scroll to bottom as tokens arrive
- [ ] Works in React Native (ReadableStream compatible)
- [ ] Tests: mock SSE stream, verify token rendering, tool card rendering, error handling

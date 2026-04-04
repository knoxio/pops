# US-05: SSE streaming endpoint

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As the system, I provide a streaming chat endpoint that sends Claude's response token-by-token and executes tool calls inline.

## Acceptance Criteria

- [ ] `POST /ai/chat` Express route (not tRPC) with SSE response
- [ ] Input: `{ conversationId?, message, context, model? }`
- [ ] Creates conversation if no conversationId provided
- [ ] Builds system prompt with context + current domain verbs
- [ ] Calls Claude API with streaming enabled + tool definitions
- [ ] Streams events: `token` (text chunk), `tool_call` (tool name + params), `tool_result` (execution result), `done` (usage stats)
- [ ] Tool execution loop: when Claude emits a tool call, execute it, send result back to Claude, continue streaming
- [ ] Messages persisted to ai_messages after completion
- [ ] Auth: validates Cloudflare Access JWT (same as tRPC routes)
- [ ] Tests: mock Claude API, verify stream events, tool execution, message persistence

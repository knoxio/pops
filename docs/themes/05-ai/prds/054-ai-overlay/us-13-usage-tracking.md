# US-13: AI usage tracking integration

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As the system, I track token usage and cost for overlay conversations via the existing AI usage system (PRD-052).

## Acceptance Criteria

- [ ] After each Claude API call, record usage via the ai_usage tracking service
- [ ] Tracks: model, input tokens, output tokens, estimated cost
- [ ] Conversation-level aggregation: total tokens shown in conversation metadata
- [ ] Usage visible on the AI Usage page (PRD-052) alongside other AI operations
- [ ] Tests: usage recorded after chat, correct model and token counts

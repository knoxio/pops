# US-06: Context-aware system prompt builder

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As the system, I build a system prompt that includes current context and the active domain's verbs, keeping token usage minimal via lazy tool loading.

## Acceptance Criteria

- [ ] `buildSystemPrompt(context, domain)` returns the system prompt string
- [ ] Includes: assistant identity, current context (app, page, entity), domain list
- [ ] Current domain's verbs listed with descriptions and param signatures
- [ ] Other domains listed as names only (use `help` to discover)
- [ ] If context has an entity, include a brief summary (fetched via URI)
- [ ] Prompt instructs Claude on meta-tool usage (fetch silently, navigate visibly, help for other domains)
- [ ] Tests: prompt includes context, correct verbs for domain, entity summary when present

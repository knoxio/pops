# US-03: Meta-tools (help, fetch, search, navigate)

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As the AI, I have 4 always-available meta-tools for discovering capabilities, retrieving data, searching, and navigating the user.

## Acceptance Criteria

- [ ] `help { domain }` returns verb list with descriptions and param signatures for the requested domain
- [ ] `fetch { uri }` resolves a POPS URI, calls the appropriate getter, returns data + contextual commands. Not visible to user
- [ ] `search { query }` calls the PRD-057 search engine, returns results + per-result commands. Not visible to user
- [ ] `navigate { uri }` resolves a POPS URI to a frontend route and sends a navigation event to the client. Visible to user (browser navigates)
- [ ] All 4 defined as Claude tool definitions in the system prompt
- [ ] Tests: help returns correct verbs, fetch resolves URI and returns commands, search delegates to engine, navigate emits client event

# Epic 01: AI Overlay

> Theme: [AI](../README.md)

## Scope

Build a contextual AI assistant integrated into the shell. Knows which app the user is in, can query across domains via universal object URIs (ADR-012), and suggests actions. Interactive — "help me do it."

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 054 | [AI Overlay](../prds/054-ai-overlay/README.md) | Shell-integrated assistant, cross-domain queries, contextual suggestions, action execution | Not started |

## Dependencies

- **Requires:** Multiple domains with real data (Phase 2 apps), ADR-012 (universal object URIs for cross-domain references)
- **Unlocks:** Natural language interaction with the platform

## Out of Scope

- Proactive monitoring and alerts (Epic 02)
- General-purpose chatbot (overlay is POPS-specific)

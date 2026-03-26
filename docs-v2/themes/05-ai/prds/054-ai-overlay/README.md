# PRD-054: AI Overlay

> Epic: [01 — AI Overlay](../../epics/01-ai-overlay.md)
> Status: To Review

## Overview

Build a contextual AI assistant integrated into the shell. Knows which app the user is in and what they're looking at (via PRD-058 Contextual Intelligence). Can query across domains via universal object URIs (ADR-012), suggest actions, and help the user accomplish tasks.

## Capabilities

- **Contextual queries:** "How much did I spend at Woolworths this month?" while on the finance dashboard
- **Cross-domain queries:** "Show me everything related to IKEA" → transactions + inventory items
- **Action suggestions:** On a movie detail page → "Add to watchlist", "Compare with similar"
- **Data exploration:** "What's my most expensive inventory item?" → navigates to the answer

## Architecture

- Shell-integrated panel (slide-out or overlay)
- Consumes contextual intelligence (PRD-058) for app/page/entity awareness
- Queries via universal object URIs (ADR-012) for cross-domain results
- Claude API for natural language understanding
- Results link to specific pages/items via URIs

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-overlay-ui](us-01-overlay-ui.md) | Shell-integrated assistant panel with input and response display | No (first) |
| 02 | [us-02-context-injection](us-02-context-injection.md) | Inject current context (app, page, entity) into AI prompts | Blocked by us-01 |
| 03 | [us-03-cross-domain-query](us-03-cross-domain-query.md) | Query across domains, return results with URI links | Blocked by us-02 |
| 04 | [us-04-action-suggestions](us-04-action-suggestions.md) | Contextual action suggestions based on current page | Blocked by us-02 |

## Out of Scope

- Proactive monitoring and alerts (PRD-055)
- Autonomous actions (AI suggests, user confirms)
- Voice input

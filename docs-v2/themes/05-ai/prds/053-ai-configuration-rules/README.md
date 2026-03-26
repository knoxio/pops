# PRD-053: AI Configuration & Rules

> Epic: [00 — AI Operations App](../../epics/00-ai-operations-app.md)
> Status: To Review

## Overview

Add configuration and rule management pages to the AI operations app. Model selection, token budgets, prompt template viewing, categorisation rule browser, and cache management.

## Pages

### Model Configuration
- Select AI model (currently Claude Haiku, could add others)
- Token budget per period (monthly limit)
- Fallback behaviour when budget exceeded (skip AI / use cheaper model / alert)

### Categorisation Rules Browser
- View all correction rules from the corrections table (PRD-024)
- Filter by: confidence, times_applied, match_type
- Sort by confidence or usage
- Inline confidence adjustment
- Delete low-value rules

### Cache Management
- View cache stats: total entries, disk size, hit rate
- Clear stale entries (older than N days)
- Full cache clear with confirmation

### Prompt Templates (read-only)
- View the prompts used for entity matching and categorisation
- No editing — prompts live in code. This is visibility only

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-model-config](us-01-model-config.md) | Model selection, token budget, fallback behaviour settings | Yes |
| 02 | [us-02-rules-browser](us-02-rules-browser.md) | Corrections table browser with filters, sorting, inline confidence adjustment | Yes |
| 03 | [us-03-cache-management](us-03-cache-management.md) | Cache stats, clear stale/all, confirmation dialogs | Yes |
| 04 | [us-04-prompt-viewer](us-04-prompt-viewer.md) | Read-only prompt template display | Yes |

All USs can parallelise — independent pages.

## Out of Scope

- AI overlay (PRD-054)
- AI inference (PRD-055)
- Custom prompt editing (prompts live in code)

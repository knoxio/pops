# US-04: Contextual action suggestions

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As a user, I want the AI to suggest relevant actions based on what I'm looking at so that I can take action faster.

## Acceptance Criteria

- [ ] On movie detail page: suggest "Add to watchlist", "Compare with similar", "Check Radarr status"
- [ ] On inventory item: suggest "Check warranty status", "Find connected items"
- [ ] On transactions: suggest "Show budget for this category", "Find similar transactions"
- [ ] Suggestions appear as quick-action buttons in the overlay
- [ ] Clicking a suggestion executes the action or navigates appropriately

## Notes

Suggestions are contextual — they change based on the current page and entity. The AI uses the context from PRD-058 to determine relevant actions.

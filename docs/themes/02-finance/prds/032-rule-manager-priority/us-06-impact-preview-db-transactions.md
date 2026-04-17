# US-06: Impact preview with DB transactions

> PRD: [032 — Global Rule Manager & Priority Ordering](README.md)
> Status: Done

## Description

As a user, I want the impact preview in browse mode to show both import transactions and existing DB transactions so that I can understand the full effect of a rule change before committing it.

## Acceptance Criteria

- [x] In browse mode, the impact preview panel has two distinct sections: "Import transactions affected" and "Existing transactions affected".
- [x] Existing DB transactions are fetched once when browse mode opens and passed to the in-memory matcher for preview computation.
- [x] The in-memory matcher (`findMatchingCorrectionFromRules`) is reused for both import and DB transaction previews — no separate matching logic.
- [x] If the fetched DB transaction count exceeds `PREVIEW_CHANGESET_MAX_TRANSACTIONS` (2000), the preview is capped and a "Preview truncated — showing first 2000 of N transactions" hint is displayed.
- [x] Each section shows per-operation impact counts in the sidebar alongside the rule, consistent with the existing proposal-mode impact counts.
- [x] The Combined-effect toggle (from PRD-028 US-06) works across both sections, showing the net effect on import and DB transactions together.
- [x] Stale preview indicators and the Re-run preview action work identically to proposal mode.
- [x] In proposal mode (not browse), the preview behaviour is unchanged — only import transactions are shown.

## Notes

Fetching ~10-20k existing transactions for in-memory matching is feasible for the preview use case. The fetch should be a single bulk query, not paginated. If performance becomes an issue at scale, a server-side preview endpoint can be added later — that is out of scope for this story.

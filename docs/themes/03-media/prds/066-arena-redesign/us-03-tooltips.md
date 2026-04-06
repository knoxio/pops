# US-03: Tooltips on all icon buttons

> PRD: [066 — Arena Redesign](README.md)
> Status: Done

## Description

As a user, I want tooltips on every icon-only button in the arena so I can discover what unfamiliar icons do without trial and error.

## Acceptance Criteria

- [x] Watchlist bookmark: "Add to watchlist" / "On watchlist"
- [x] Draw high (ChevronUp): "Equally great" (`side="right"`)
- [x] Draw mid (Minus): "Equally average" (`side="right"`)
- [x] Draw low (ChevronDown): "Equally poor" (`side="right"`)
- [x] Skip (SkipForward): "Skip pair" (`side="right"`)
- [x] N/A (Ban): "N/A for {dimensionName}" (`side="right"`)
- [x] Stale (Clock): "Stale — reduce score weight"
- [x] Not Watched (EyeOff): "Not watched — remove from {dimensionName}"
- [x] History (History icon): "History"
- [x] All tooltips use `<Tooltip>` + `<TooltipTrigger>` + `<TooltipContent>` from `@pops/ui`

## Notes

Center column tooltips use `side="right"` so they don't overlap with the poster cards. Poster overlay tooltips use default positioning (top).

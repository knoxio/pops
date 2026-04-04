# US-08: Review tabbed view

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want transactions categorized into tabs (Matched/Uncertain/Failed/Skipped) so that I can focus on the ones that need attention.

## Acceptance Criteria

- [x] Four tabs: Matched, Uncertain, Failed, Skipped
- [x] Each tab shows count badge
- [x] Default tab: Uncertain (if any exist), otherwise Matched
- [x] Skipped tab shows read-only table with skip reason ("Duplicate transaction (checksum match)")
- [x] Matched tab shows read-only transaction cards (can still edit via dialog)
- [x] Tab switching preserves scroll position within each tab

## Notes

This is the container only. Transaction cards (US-09), entity selection (US-10), and other review actions are separate USs.

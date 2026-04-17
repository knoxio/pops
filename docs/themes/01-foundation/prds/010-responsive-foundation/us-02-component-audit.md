# US-02: Responsive component audit

> PRD: [010 — Responsive Foundation](README.md)
> Status: Done

## Description

As a user on a small screen, I want tables, forms, and dialogs to be usable so that I can interact with data on mobile.

## Acceptance Criteria

- [x] DataTable: horizontal scroll on mobile, no content clipped
- [x] DataTableFilters: collapsed behind "Filters" button on mobile, opens as sheet/drawer — mobile "Filters" button opens a Dialog overlay with apply/clear actions
- [x] Forms: labels stacked above inputs, inputs full-width, min height 44px — labels stacked ✅, full-width ✅, default height h-11 (44px) ✅
- [x] Dialogs: full-screen on mobile (<768px), slide up from bottom if feasible
- [x] Autocomplete/Combobox: dropdown positioned correctly, not viewport-clipped
- [x] ChipInput: chips wrap to multiple lines, remove buttons touch-friendly — wraps ✅, remove buttons min-w-11 min-h-11 (44px) ✅
- [x] All components verified at 375px — no overflow, no clipping — filter selects use w-full on mobile, sm: prefix scopes fixed widths to ≥640px

## Notes

Start with horizontal scroll for DataTable (simpler). Card/list view for mobile is a future enhancement if needed. CSS-driven via Tailwind responsive classes — avoid JavaScript detection.

# US-02: Responsive component audit

> PRD: [010 — Responsive Foundation](README.md)
> Status: To Review

## Description

As a user on a small screen, I want tables, forms, and dialogs to be usable so that I can interact with data on mobile.

## Acceptance Criteria

- [ ] DataTable: horizontal scroll on mobile, no content clipped
- [ ] DataTableFilters: collapsed behind "Filters" button on mobile, opens as sheet/drawer
- [ ] Forms: labels stacked above inputs, inputs full-width, min height 44px
- [ ] Dialogs: full-screen on mobile (<768px), slide up from bottom if feasible
- [ ] Autocomplete/Combobox: dropdown positioned correctly, not viewport-clipped
- [ ] ChipInput: chips wrap to multiple lines, remove buttons touch-friendly
- [ ] All components verified at 375px — no overflow, no clipping

## Notes

Start with horizontal scroll for DataTable (simpler). Card/list view for mobile is a future enhancement if needed. CSS-driven via Tailwind responsive classes — avoid JavaScript detection.

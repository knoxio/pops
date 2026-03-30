# US-02: Responsive component audit

> PRD: [010 — Responsive Foundation](README.md)
> Status: Partial

## Description

As a user on a small screen, I want tables, forms, and dialogs to be usable so that I can interact with data on mobile.

## Acceptance Criteria

- [x] DataTable: horizontal scroll on mobile, no content clipped
- [ ] DataTableFilters: collapsed behind "Filters" button on mobile, opens as sheet/drawer — toggle button exists but opens inline grid, not a sheet/drawer
- [ ] Forms: labels stacked above inputs, inputs full-width, min height 44px — labels stacked ✅, full-width ✅, but default height is 40px (h-10), not 44px
- [x] Dialogs: full-screen on mobile (<768px), slide up from bottom if feasible
- [x] Autocomplete/Combobox: dropdown positioned correctly, not viewport-clipped
- [ ] ChipInput: chips wrap to multiple lines, remove buttons touch-friendly — wraps ✅, but remove buttons are 32px (below 44px touch target)
- [ ] All components verified at 375px — no overflow, no clipping — filter selects have fixed widths (w-45, min-w-50) that may overflow 375px

## Notes

Start with horizontal scroll for DataTable (simpler). Card/list view for mobile is a future enhancement if needed. CSS-driven via Tailwind responsive classes — avoid JavaScript detection.

# US-04: Build data display composites

> PRD: [003 — Components](README.md)
> Status: Done

## Description

As a developer, I want data display components (DataTable, filters, view toggle) in `@pops/ui` so that any app can display tabular and grid data with consistent patterns.

## Acceptance Criteria

- [x] DataTable — sortable columns, pagination, row selection, horizontal scroll on mobile
- [x] DataTableFilters — filter bar with column-specific filter inputs
- [x] InfiniteScrollTable — DataTable variant with scroll-based pagination
- [x] EditableCell — inline cell editing with save/cancel
- [x] ViewToggleGroup — table/grid toggle, segmented button style, persists to localStorage
- [x] StatCard — metric display card with label, value, optional trend indicator
- [x] DataTableFilters has co-located `.stories.tsx`
- [x] EditableCell has co-located `.stories.tsx`
- [x] StatCard has co-located `.stories.tsx`
- [x] All exported from barrel `index.ts`
- [x] All use design tokens — no arbitrary values or hardcoded colours
- [x] DataTable scrolls horizontally on viewports below 768px
- [x] ViewToggleGroup rendered directly above the content it controls, not in page header

## Notes

DataTable is the most complex shared component. It needs to handle large datasets (1000+ rows for transactions) without performance issues. InfiniteScrollTable is a variant for pages where pagination controls don't make sense.

ViewToggleGroup persistence uses page-specific localStorage keys (e.g., `inventory-view-mode`, `media-library-view-mode`).

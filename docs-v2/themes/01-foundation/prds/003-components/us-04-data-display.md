# US-04: Build data display composites

> PRD: [003 — Components](README.md)
> Status: Partial

**GH Issue:** #397

## Audit Findings

**Present:**
- `DataTable.tsx` — TanStack Table with sorting, filtering, pagination; stories at `DataTable.stories.tsx` and `DataTable.filtering.stories.tsx`
- `DataTableFilters.tsx` — filter bar component
- `InfiniteScrollTable.tsx` — scroll-based pagination variant; story at `InfiniteScrollTable.stories.tsx`
- `EditableCell.tsx` — inline cell editing
- `StatCard.tsx` — metric card with oklch color variants and trend support; all using design tokens

**Missing:**
- `ViewToggleGroup` — table/grid toggle persisting to localStorage is not implemented; apps use their own ad-hoc patterns

## Description

As a developer, I want data display components (DataTable, filters, view toggle) in `@pops/ui` so that any app can display tabular and grid data with consistent patterns.

## Acceptance Criteria

- [ ] DataTable — sortable columns, pagination, row selection, horizontal scroll on mobile
- [ ] DataTableFilters — filter bar with column-specific filter inputs
- [ ] InfiniteScrollTable — DataTable variant with scroll-based pagination
- [ ] EditableCell — inline cell editing with save/cancel
- [ ] ViewToggleGroup — table/grid toggle, segmented button style, persists to localStorage
- [ ] StatCard — metric display card with label, value, optional trend indicator
- [ ] Each component has co-located `.stories.tsx`
- [ ] All exported from barrel `index.ts`
- [ ] All use design tokens — no arbitrary values or hardcoded colours
- [ ] DataTable scrolls horizontally on viewports below 768px
- [ ] ViewToggleGroup rendered directly above the content it controls, not in page header

## Notes

DataTable is the most complex shared component. It needs to handle large datasets (1000+ rows for transactions) without performance issues. InfiniteScrollTable is a variant for pages where pagination controls don't make sense.

ViewToggleGroup persistence uses page-specific localStorage keys (e.g., `inventory-view-mode`, `media-library-view-mode`).

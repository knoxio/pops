# US-03: Empty, loading, and error states

> PRD: [031 — Library Page](README.md)
> Status: Partial

## Description

As a user, I want clear feedback when the library is empty, loading, or has an error so that I know what is happening and what to do next.

## Acceptance Criteria

- [x] Empty state renders when the library has zero items (no filters active): heading, descriptive text, and a CTA link/button navigating to `/media/search`
- [ ] Empty search state renders when filters/search return zero results: "No results for [query]" message with a "Clear search" button that resets all filters — search not implemented; shows generic "No results match your filters" without clear button
- [x] Loading state renders a skeleton grid matching the poster card dimensions and the current column count
- [ ] Skeleton cards animate with a shimmer/pulse effect — skeletons render but no shimmer/pulse animation
- [ ] Skeleton grid renders the expected number of cards based on the current page size (24/48/96) — hardcoded to 12; pagination not implemented
- [ ] Error state renders an error message with a "Retry" button that re-fetches the library data — no error state handling
- [ ] Error state does not show a stack trace or technical details to the user — not implemented
- [x] States transition correctly: loading → content (or empty, or error)
- [ ] Tests cover: empty state renders with CTA link, empty search state shows clear button, skeleton grid renders correct card count, error state renders retry button, retry triggers re-fetch

## Notes

Empty state and empty search state are distinct: empty state means zero library items total (show CTA to add content), empty search state means the current query/filter matched nothing (show clear filters action). The skeleton grid should match the responsive column count so the layout does not shift when data arrives.

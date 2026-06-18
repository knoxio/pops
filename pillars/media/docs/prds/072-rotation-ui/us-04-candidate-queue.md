# US-04: Candidate Queue Page

> PRD: [Rotation UI](README.md)

## Description

As a user, I want to browse the candidate queue and exclusion list so that I can see what movies are coming, exclude unwanted ones, and manage the pipeline.

## Acceptance Criteria

- [x] Tabbed view with three tabs: Pending, Added, Excluded
- [x] **Pending tab:** shows candidates with `status = 'pending'`. Columns/cards: poster, title, year, rating, source name, priority badge, discovered date. Actions per item: "Download" (bypass queue → Radarr), "Exclude"
- [x] **Added tab:** shows candidates with `status = 'added'`. Columns/cards: poster, title, year, source, date added. Read-only
- [x] **Excluded tab:** shows `rotation_exclusions` entries. Columns/cards: poster, title, excluded date, reason. Action: "Un-exclude"
- [x] All tabs are paginated (default 20 per page) and searchable by title
- [x] Pending tab shows total count badge on the tab label
- [x] "Download" action on a pending candidate: removes from queue, adds to Radarr with search, creates POPS library entry with `rotation_status = 'protected'`
- [x] "Exclude" action: moves candidate to exclusion list, optionally with a reason (text input in a small popover)

## Notes

Use the existing DataTable or card grid components. The poster can use the `poster_path` from the candidate record with the TMDB image base URL.

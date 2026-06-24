# Comparison History — Search & Filter by Movie Title

> Status: Done

Filter the paginated comparison-history list by movie title. Without it, a flat chronological list with only a dimension dropdown makes finding comparisons that involve a specific film impractical once there are hundreds of rows.

## REST API

Search is a server-side filter on the existing list-all endpoint (client-side filtering is not viable: pagination is server-side and titles are resolved per row).

| Method | Path           | Query                                                 | Notes                                        |
| ------ | -------------- | ----------------------------------------------------- | -------------------------------------------- |
| GET    | `/comparisons` | `dimensionId?`, `search?`, `limit?` (≤100), `offset?` | Returns `{ data: Comparison[], pagination }` |

- `search` is `string`, max 100 chars (validated at the contract boundary; longer rejects with 400).
- When `search` is present, the query resolves movie ids whose `title` matches `LIKE %search%` (SQLite `LIKE` is case-insensitive for ASCII), then returns comparisons where `mediaAId` OR `mediaBId` is one of those ids. No matches short-circuits to `{ data: [], total: 0 }`.
- `dimensionId` and `search` compose with AND.
- `pagination.total` is the filtered count, not the global count.

## Frontend

- Route `/media/compare/history` (`ComparisonHistoryPage`).
- A text `Input` ("Search by movie title…") sits beside the dimension `Select`; both feed `GET /comparisons`.
- The search term is debounced 300 ms (`useDebouncedValue`) before the query key changes, so keystrokes don't spam the API.
- Changing either filter resets the page to 0.
- An all-whitespace / empty term is trimmed to `undefined` — no `search` param is sent (unfiltered list).
- The "N comparisons" count renders `pagination.total` (the filtered total).
- Zero results reuse the existing "No comparisons yet" empty card.

## Acceptance criteria

- [x] Search input renders beside the dimension dropdown on `/media/compare/history`.
- [x] Typing filters to comparisons where either side's movie title matches (case-insensitive substring).
- [x] Search is debounced 300 ms before the query fires.
- [x] Changing the search term (or dimension) resets pagination to page 0.
- [x] The "N comparisons" count reflects `pagination.total` (filtered), not the global total.
- [x] `search` and `dimensionId` compose (both may be active).
- [x] Empty / whitespace-only search sends no `search` param (unfiltered list).
- [x] `search` validated at the contract boundary: max 100 characters.
- [x] Tests cover: input renders, debounced typing triggers a filtered query, whitespace clears the filter, backend `search` narrows `pagination.total`.

## Edge cases / known limits

- Search matches **movie** titles only — the title lookup joins the `movies` table. Comparisons that involve a TV show are reachable only via their movie counterpart, never by the show's title. Extending search to TV titles is tracked in [ideas/comparisons-tv-and-ai.md](../../ideas/comparisons-tv-and-ai.md).

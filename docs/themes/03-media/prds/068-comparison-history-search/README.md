# PRD-068: Comparison History — Search & Filter by Movie Title

> Epic: [04 — Ratings & Comparisons](../../epics/04-ratings-comparisons.md)
> Status: Done

## Overview

Add a search input to the comparison history page so users can filter the paginated list by movie title. Today the history shows a flat chronological list with only a dimension filter; with hundreds of comparisons it's hard to find comparisons involving a specific movie.

## Routes

| Route                    | Page                          |
| ------------------------ | ----------------------------- |
| `/media/compare/history` | Comparison History (existing) |

## UI

| Element         | Detail                                                                                  |
| --------------- | --------------------------------------------------------------------------------------- |
| Search input    | Text input beside the existing dimension dropdown, placeholder "Search by movie title…" |
| Debounce        | 300 ms debounce before query fires                                                      |
| Reset on change | Changing the search term resets pagination to page 0                                    |
| Empty state     | Existing "No comparisons yet" message reused when search yields no results              |
| Count label     | Existing "N comparisons" count reflects filtered total                                  |

## API

Add `search?: string` to `ComparisonHistoryQuerySchema`. When provided, filter comparisons to rows where either `media_a_id` or `media_b_id` references a movie whose `title` matches `LIKE %search%` (case-insensitive).

## Business Rules

- Search operates server-side — client-side filtering is not viable because movie titles are resolved lazily per row and pagination is server-side
- Search and dimension filter compose (AND): both may be active simultaneously
- Search resets page to 0 when changed
- Minimum search length: none (empty string = no filter)
- Maximum search length: 100 characters (validated at API boundary)

## User Stories

| #   | Story                                         | Summary                                      | Status | Parallelisable |
| --- | --------------------------------------------- | -------------------------------------------- | ------ | -------------- |
| 01  | [us-01-search-filter](us-01-search-filter.md) | Backend search param + frontend search input | Done   | Yes            |

## Drift Check

last checked: 2026-04-17

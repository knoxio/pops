# US-01: Comparison history search by movie title

> PRD: [068 — Comparison History Search & Filter](README.md)
> Status: Done

## Description

As a user, I want to search my comparison history by movie title so that I can quickly find all comparisons involving a specific film.

## Acceptance Criteria

- [x] Search input renders beside the dimension dropdown on the comparison history page
- [x] Typing in the search input filters the list to comparisons where either movie's title matches (case-insensitive, substring)
- [x] Search is debounced (300 ms) to avoid spamming the API on each keystroke
- [x] Changing the search term resets pagination to page 1
- [x] The "N comparisons" count reflects the filtered total, not the global total
- [x] Search and dimension filter compose: both may be active simultaneously
- [x] Empty search string returns the unfiltered list (no active search)
- [x] `search` param validated: max 100 characters
- [x] Tests cover: search renders, search triggers filtered query, empty search clears filter

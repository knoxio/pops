# US-01: Compare arena

> PRD: [037 — Ratings & Comparisons](README.md)
> Status: Done

## Description

As a user, I want to compare two watched movies side by side across taste dimensions so that I can build a personal ranking of my movie library.

## Acceptance Criteria

- [x] Compare arena page renders at `/media/compare`
- [x] Page displays two movie poster cards side by side with title, year, and poster image
- [x] Current dimension is displayed prominently above the pair: "Which has better {Dimension}?"
- [x] Clicking/tapping a movie card selects it as the winner for the current dimension
- [x] After picking a winner, the comparison is recorded via `media.comparisons.record` and a new pair loads
- [x] Dimension rotates through all active dimensions in order — one dimension per comparison
- [x] "Skip" button below the pair fetches a new random pair without recording a comparison
- [x] Random pair is fetched via `media.comparisons.getRandomPair` with the current dimension ID
- [x] Recently compared pairs are avoided (last 10 pairs) — pair avoidance is server-side
- [x] When fewer than 2 watched movies exist, display "Not enough watched movies" with a CTA linking to the library
- [x] Loading state: skeleton pair cards while fetching the next pair
- [x] Transition animation between pairs (fade or slide) for visual feedback
- [x] Picking a winner disables both cards until the next pair loads (prevent double-submission)
- [x] Tests cover: pair renders with correct data, pick winner calls record API, skip fetches new pair, dimension rotates after pick, minimum threshold message renders, double-click prevention

## Notes

The dimension rotation resets to the first dimension when the user navigates away and returns. Pair avoidance is handled server-side by `getRandomPair` — the client does not need to track previously shown pairs. The arena is movies-only; TV show comparisons are out of scope.

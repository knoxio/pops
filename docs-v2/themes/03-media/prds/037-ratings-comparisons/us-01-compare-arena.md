# US-01: Compare arena

> PRD: [037 — Ratings & Comparisons](README.md)
> Status: To Review

## Description

As a user, I want to compare two watched movies side by side across taste dimensions so that I can build a personal ranking of my movie library.

## Acceptance Criteria

- [ ] Compare arena page renders at `/media/compare`
- [ ] Page displays two movie poster cards side by side with title, year, and poster image
- [ ] Current dimension is displayed prominently above the pair: "Which has better {Dimension}?"
- [ ] Clicking/tapping a movie card selects it as the winner for the current dimension
- [ ] After picking a winner, the comparison is recorded via `media.comparisons.record` and a new pair loads
- [ ] Dimension rotates through all active dimensions in order — one dimension per comparison
- [ ] "Skip" button below the pair fetches a new random pair without recording a comparison
- [ ] Random pair is fetched via `media.comparisons.getRandomPair` with the current dimension ID
- [ ] Recently compared pairs are avoided (last 10 pairs) — pair avoidance is server-side
- [ ] When fewer than 2 watched movies exist, display "Not enough watched movies" with a CTA linking to the library
- [ ] Loading state: skeleton pair cards while fetching the next pair
- [ ] Transition animation between pairs (fade or slide) for visual feedback
- [ ] Picking a winner disables both cards until the next pair loads (prevent double-submission)
- [ ] Tests cover: pair renders with correct data, pick winner calls record API, skip fetches new pair, dimension rotates after pick, minimum threshold message renders, double-click prevention

## Notes

The dimension rotation resets to the first dimension when the user navigates away and returns. Pair avoidance is handled server-side by `getRandomPair` — the client does not need to track previously shown pairs. The arena is movies-only; TV show comparisons are out of scope.

# ADR-010: Pairwise ELO Comparisons Over Star Ratings

## Status

Accepted

## Context

The media app needs a preference capture mechanism so the recommendation engine can learn taste. It must be low-friction (output > input), produce rich preference data, and scale across multiple taste dimensions (cinematography, fun, rewatchability, etc.).

## Options Considered

| Option                         | Pros                                                                                                                                                            | Cons                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Star ratings (1-5 or 1-10)     | Familiar, fast                                                                                                                                                  | Inconsistent over time, central tendency bias, no relative ranking, multi-dimensional ratings become tedious |
| Thumbs up/down                 | Fastest input, zero cognitive load                                                                                                                              | Loses all nuance, no relative ranking, multi-dimensional binary is meaningless                               |
| Pairwise comparison with ELO   | Binary decision is fast (two taps), relative ranking is more natural, self-calibrating scores, multi-dimensional stays lightweight, richer data per interaction | Cold start with small library, scores are relative not absolute, more comparisons needed for full ranking    |
| Ranked lists (drag to reorder) | Complete ranking, no ambiguity                                                                                                                                  | Doesn't scale past 100 items on mobile, multi-dimensional lists are unusable                                 |

## Decision

Pairwise ELO comparisons. Three reasons:

1. **Output > Input** — Two taps per comparison. Feels like play, not data entry. Surfaced contextually (after watching, on home screen)
2. **Multi-dimensional without tedium** — 5 dimensions via comparisons = 5 quick "A or B?" taps, each scoring two items
3. **Better preference signal** — "Titanic has better cinematography than Avatar" is more actionable than both getting 4/5 stars

Comparison dimensions are stored as data (not code) — adding/removing dimensions is a data operation. Movies only in v1; TV comparisons deferred until the show-vs-season comparison UX is properly designed.

## Consequences

- The comparison flow is the primary preference input, not secondary
- No star ratings anywhere in the UI — scores are ELO-derived, displayed as relative rankings or radar charts
- Cold start is real: <10 titles means repetitive comparisons. Mitigated by seeding from community ratings
- The recommendation engine operates on relative scores and genre affinity, not absolute ratings
- Comparison fatigue is the main risk — keep comparisons to 2 taps, contextual, never forced

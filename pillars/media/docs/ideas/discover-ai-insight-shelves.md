# Idea: AI-generated insight shelves on Discover

The discover page assembles shelves from a static registry (genre, dimension, context, trending, local-window, seed-based). Every shelf today is rule-driven: genre IDs, ELO affinities, time-of-day triggers, TMDB queries. There is no shelf whose theme is inferred from natural-language understanding of a movie's content.

## What to build later

LLM-themed shelves that surface cross-cutting attributes TMDB genres/keywords can't express, e.g. "Movies with a strong female lead", "Slow-burn character studies", "One-location thrillers", "Films that stick the landing". Each becomes a `ShelfDefinition` whose `generate()` resolves an LLM-derived candidate set rather than a TMDB discover query.

### Sketch

- A batch/offline pass tags library + candidate movies with insight labels (LLM over synopsis/credits/keywords), cached so the request path stays cheap.
- New shelf definitions keyed off those labels, slotted into the existing registry and session-scoring/variety machinery (no new selection engine needed).
- Reuse `scoreDiscoverResults` for ordering within an insight shelf; freshness via `shelf_impressions` as with every other shelf.

### Why deferred

Requires an LLM integration the media pillar doesn't have, plus a tagging/caching layer to keep latency and cost bounded. The rule-based shelves cover the current surface; this is additive personalisation, not a gap in the shipped page.

Related: `discovery-composite-scoring.md`, `comparisons-tv-and-ai.md` in this folder.

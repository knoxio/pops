# US-13: Context collection definitions

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a developer, I want static context collection definitions so the context-aware endpoint can match them against the current time/date.

## Acceptance Criteria

- [x] `ContextCollection` type: `{ id, title, emoji, genreIds: number[], keywords: string[], trigger: (hour, month, dayOfWeek) => boolean }`
- [x] Definitions stored as a constant array in the discovery module (data, not DB)
- [x] Collections defined:

| ID            | Title                | Trigger           | TMDB Genres/Keywords                      |
| ------------- | -------------------- | ----------------- | ----------------------------------------- |
| date-night    | Date Night           | Fri-Sat, 6-10pm   | Romance (10749) + Comedy (35)             |
| sunday-flicks | Sunday Flicks        | Sunday, all day   | Drama (18), sort: popularity              |
| late-night    | Late Night Thrillers | Any day, 10pm-2am | Thriller (53) + Mystery (9648)            |
| halloween     | Halloween            | October           | Horror (27), keyword: halloween           |
| christmas     | Christmas Movies     | December          | keyword: christmas                        |
| oscar-season  | Oscar Winners        | Feb-Mar           | keyword: oscar, academy award             |
| rainy-day     | Rainy Day            | Always (fallback) | Comedy (35) + Drama (18) + Animation (16) |

- [x] Each collection maps to a TMDB `/discover/movie` query with genre IDs and/or keyword IDs
- [x] `getActiveCollections(hour, month, dayOfWeek)` returns matching collections (max 2, always includes fallback if <2 match)
- [x] Tests cover: time matching for each trigger, fallback selection, max 2 limit

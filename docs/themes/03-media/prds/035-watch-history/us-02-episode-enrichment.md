# US-02: Episode enrichment

> PRD: [035 — Watch History](README.md)
> Status: Done

## Description

As a user, I want episode entries in my watch history to show the parent show name, season number, and episode number so that I can tell which show and episode I watched at a glance.

## Acceptance Criteria

- [x] Episode entries display the show name above or alongside the episode title
- [x] Season and episode numbers render in standard format: "S01E03" (zero-padded to 2 digits)
- [x] Subtitle line reads: "{Show Name} — S{XX}E{XX}" (e.g., "Breaking Bad — S02E10")
- [x] Show name links to the show detail page (`/media/tv/:showId`)
- [x] Season identifier links to the season detail within the show page (`/media/tv/:showId?season=:seasonNumber`)
- [x] Movie entries are unaffected — they render title only with no subtitle
- [x] When show metadata is missing from the enriched response, the episode renders with its own title only (graceful degradation)
- [x] Tests cover: episode subtitle format, show name link URL, season link URL, fallback when show data is missing, movie entries have no subtitle

## Notes

The `listRecent` procedure enriches episode watch events with the parent show's name and poster. The component should handle the case where enrichment data is incomplete — display what's available rather than breaking. The S01E03 format should zero-pad both season and episode numbers (season 1, episode 3 becomes S01E03, not S1E3).

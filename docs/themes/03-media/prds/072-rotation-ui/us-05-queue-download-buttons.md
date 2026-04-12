# US-05: Queue & Download Buttons

> PRD: [Rotation UI](README.md)

## Description

As a user, I want "Add to Queue" and "Download" buttons on movie discovery pages so that I can control how new movies enter my library.

## Acceptance Criteria

- [ ] On search results, Discover page, and anywhere a non-library movie card appears: show two action buttons
- [ ] **"Add to Queue"** — creates a `rotation_candidates` entry with source = `manual`. Toast: "Added to rotation queue". Button changes to "In Queue" badge after click
- [ ] **"Download"** — adds to Radarr with `searchForMovie: true`, creates POPS library entry with `rotation_status = 'protected'`. Toast: "Downloading — protected for 30 days". Button changes to status indicator (downloading/available)
- [ ] If the movie is already in the library: show library status instead of action buttons (existing behaviour)
- [ ] If the movie is already in the candidate queue: show "In Queue" badge with option to remove
- [ ] If the movie is in the exclusion list: show "Excluded" badge with option to un-exclude
- [ ] Buttons replace or sit alongside the existing "Request" button — no duplicate functionality
- [ ] Both buttons are available only when rotation is enabled. When disabled, the existing request flow is used

## Notes

This changes the movie request flow. When rotation is enabled, the two-button pattern replaces the single "Request" button. When rotation is disabled, the original request flow (direct to Radarr) remains. The transition should be seamless — no config migration needed, just conditional rendering.

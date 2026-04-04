# US-05: Debrief notifications

> PRD: [063 — Post-Watch Debrief](README.md)
> Status: Not started

## Description

As a user, I want to see debrief prompts on the history page, library page, and movie detail page so I know which movies need debriefing.

## Acceptance Criteria

- [ ] History page: "Debrief" button on movie tiles with pending debriefs
- [ ] Library page: notification banner "N movies to debrief" — links to first pending, dismissible
- [ ] Movie detail page: "Debrief this movie" button when debrief is pending
- [ ] All buttons link to `/media/debrief/:movieId`
- [ ] Buttons/banner hidden once all dimensions are debriefed or dismissed
- [ ] Dismissing the library banner does not dismiss individual debrief rows (just hides the banner for the session)
- [ ] Tests: button shows for pending, hidden for complete, banner shows count, dismiss works

# US-02: Page context hooks

> PRD: [058 — Contextual Intelligence](README.md)
> Status: Done

## Description

As a developer, I want hooks that pages call to set their specific context so that consumers know not just the app, but the exact page and entity.

## Acceptance Criteria

- [x] `useSetPageContext({ page, pageType, entity?, filters? })` hook for pages to call on mount
- [x] Context updates when page mounts — stale context from previous page cleared
- [x] Drill-down pages set entity context (e.g., movie detail sets the movie's URI and title)
- [x] List pages set filter context (e.g., transactions page sets active account/type/tag filters)
- [x] Context clears on unmount (navigation away)

## Notes

Each page calls this hook once in its component body. The hook handles mount/unmount/update lifecycle. Pages don't need to know who consumes the context.

# Idea: Drafts-tab cursor pagination (infinite scroll)

## Problem

The Drafts tab at `/food/inbox` renders only the first page of results (default `limit=20`). With a deep queue, rows past the first page are unreachable from the UI.

## Why it isn't built

The server side is already done: `POST /inbox/list` returns an opaque `nextCursor` and accepts a `cursor` to fetch the next page (cursor encodes `{ score, ingestedAt, versionId }`, tie-break-stable across every sort order). The frontend, however, uses a plain single-page `useQuery` and never consumes `nextCursor` — there is no "load more" or infinite-scroll trigger.

## Proposed scope

- Replace the Drafts-tab `useQuery` with `useInfiniteQuery`, threading `nextCursor` as `getNextPageParam` and flattening pages into the row list.
- Add an intersection-observer sentinel (or a "Load more" button) that calls `fetchNextPage` when the user reaches the bottom.
- Reset the accumulated pages and scroll position whenever filters or sort change (a sort/filter change must refetch from the top, not append).
- Keep the 60s `refetchInterval` behaviour; reconcile it with the paged cache so a poll refreshes the already-loaded pages rather than discarding scroll depth.

## Acceptance criteria (when built)

- Scrolling past the first page fetches the next page via the existing `cursor`.
- Changing sort or any filter resets to the first page and scrolls to top.
- The 60s poll refreshes loaded rows without losing the user's scroll depth.
- A queue of 500 `blocked`-band drafts is fully traversable 20 at a time.

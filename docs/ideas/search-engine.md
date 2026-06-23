# Search Engine — unbuilt slices

Carved out of [Search Engine](../themes/01-foundation/prds/search-engine/README.md).
The federation engine, contract, frontend registry, and the contacts adapter
are built and federated live. The slices below are scaffolded or planned but not
functional.

## Finance / inventory federation wiring

Both pillars serve a working `POST /search` and have registered frontend
ResultComponents, but their served manifest declares `search: { adapters: [] }`.
The orchestrator gates membership on a non-empty `search.adapters`, so neither is
federated today — only contacts is. To light them up:

- Declare each pillar's adapter in its served manifest (finance: a
  transactions/budgets/wishlist-representative adapter; inventory: an items
  adapter) with a `procedurePath` pointing at `search.search`.
- Confirm `SEARCH_SECTION_META` chrome (finance → `ArrowRightLeft`/green,
  inventory → `Package`/amber) renders once federated.

Acceptance:

- [ ] Finance and inventory advertise a non-empty `search.adapters` and appear
      as sections in `POST /orchestrator-api/search` results.
- [ ] Their hits render with the correct section chrome and ResultComponents.

## Media unified-search adapter

Media has no unified-search `/search` envelope — its `search-handlers.ts` is the
live TMDB/TheTVDB provider search (`media.search.movies` / `…shows`), a separate
surface. The `movies` and `tv-shows` ResultComponents exist on the frontend but
have no backend adapter feeding them.

- Add a media `POST /search` that scans the LOCAL library (movies by `title`,
  tv-shows by `name`, case-insensitive `LIKE`, exact 1.0 / prefix 0.8 /
  contains 0.5), returning the documented hit data shapes:
  - movies: `{ title, year, posterUrl, voteAverage, runtime }`, poster
    `/media/images/movie/{tmdbId}/poster.jpg`.
  - tv-shows: `{ name, year, posterUrl, status, numberOfSeasons, voteAverage }`,
    poster `/media/images/tv/{tvdbId}/poster.jpg`.
- Advertise the adapter(s) in the media manifest. Add a `media` entry to
  `SEARCH_SECTION_META` (`Film`/purple) so the section is decorated.

Acceptance:

- [ ] Media library movies/tv-shows appear as federated search sections.
- [ ] Poster falls back to the Film/Tv icon when `posterUrl` is null.

## Show-more pagination

The original design returned 5 hits per section with a "show more" affordance
that fetched additional results for a single domain. The federated engine has no
pagination: per-pillar `/search` returns a single default-capped page with no
offset/cursor, the orchestrator caps to 5 and clamps `totalCount` to returned
hits, and the frontend `handleShowMore` is a no-op.

- Add an offset/cursor to each per-pillar `/search` (or a dedicated
  `show-more` op) so a single pillar can page beyond its first batch.
- Carry the real pre-cap `totalCount` through the orchestrator (stop clamping)
  so the renderer shows the control.
- Wire `handleShowMore(domain)` to call only the one pillar, not a full
  fan-out.

Acceptance:

- [ ] `showMore(pillar, query, context, offset, limit)` returns the next page
      for a single pillar; offset-based; respects limit.
- [ ] The frontend shows "show more" only when more hits exist and appends them
      in place.

## Structured query syntax (filter application)

The orchestrator's query parser already extracts typed tokens
(`type:`/`domain:`/`year:>N`/`year:<N`/`value:>N`/`value:<N`/`warranty:expiring`;
unknown `key:value` → plain text), but `runSearch` passes only the residual text
to the fan-out and drops the filters. Nothing applies them.

- Thread parsed filters through the fan-out envelope to the relevant pillars
  (type/year → media, value/warranty → inventory) and apply them server-side.
- Combine with context ordering: filters narrow, context orders.

Acceptance:

- [ ] `type:movie year:>2000 fight` returns Fight Club only if the year filter
      is applied (1999 excluded), proving filters reach and constrain the
      pillar.
- [ ] Unrecognised filters fall back to plain text with no error.

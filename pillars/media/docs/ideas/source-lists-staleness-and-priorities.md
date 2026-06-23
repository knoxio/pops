# Source Lists: staleness, contributing-source tracking, type-based default priorities

Forward-looking refinements to the shipped rotation source/candidate system ([PRD source-lists](../prds/source-lists/README.md)). None of these are built today.

## Candidate staleness

The candidate `status` enum is only `pending | added | skipped | excluded` — there is no `stale` state and no staleness tracking. Desired:

- When a source stops returning a candidate it previously surfaced (e.g. a friend removes a movie from their watchlist, or a Letterboxd list is edited), keep the candidate in the queue for ~30 days rather than deleting it immediately.
- After the grace window, mark it `stale` and deprioritise it during weighted selection (lower its effective weight) instead of removing it — the source may re-add it.
- Requires tracking per-candidate "last seen in a sync" so the orchestration can detect disappearance. Today sync only inserts new rows (`ON CONFLICT DO NOTHING`); it never reconciles the set of ids a source returned against what it previously returned.

## Per-candidate contributing-source tracking

Today the unique `tmdb_id` index means a movie occupies exactly one candidate row, owned by whichever source inserted it first; later sources that surface the same movie are skipped. Selection-time dedup (max source priority wins) is therefore mostly dead code — there is normally only one row per id.

Desired: record the full set of sources that contribute a given movie (a junction table `rotation_candidate_sources`, or a JSON array on the candidate), so:

- The effective priority is genuinely `max(priority)` across all contributing sources, not just the first inserter's.
- The UI can show "in your watchlist AND a friend's list AND TMDB top-rated", which is a stronger signal than any single source.
- Removing one source's contribution doesn't drop a movie still surfaced by another source.

## Type-based default priorities

The schema defaults every source to priority `5`, and the lazily-created `manual` source is also priority `5`. The original design wanted opinionated defaults by source type:

- user's Plex watchlist = 10, friends' watchlists = 6, curated external lists (TMDB/Letterboxd) = 3, manual queue = 8.

Desired: seed these defaults when a source of a given type is created (still user-overridable), and create the `manual` source at boot with priority 8 rather than lazily at priority 5 on first "Add to Queue". This makes "my own watchlist dominates, curated lists are background noise" the out-of-the-box behaviour instead of every source competing equally.

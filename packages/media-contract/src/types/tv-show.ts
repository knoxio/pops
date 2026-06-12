/**
 * A TV show in the media pillar. Mirrors the API response (camelCase) for
 * downstream consumers (apps, iOS Swift codegen, SDK). DB-internal shape
 * lives in `@pops/media-db` and is not surfaced through the contract.
 *
 * The contract shape is deliberately narrower than the runtime TV show row
 * served by `apps/pops-api/src/modules/media/tv-shows`. That row carries
 * ~25 fields (overview, poster/backdrop/logo URLs, vote counts, genres,
 * networks, etc.); this contract pins only the fields needed to render and
 * reference a show. Extra fields the API still emits today are not part of
 * the contract and may be removed without a contract bump.
 *
 * Wire-format note: external ids (`tmdbId`, `tvdbId`) are typed as
 * `string | null` so the contract is stable across pillars even when the
 * underlying row stores them as numbers. `seasonCount` mirrors the live
 * row's `numberOfSeasons`.
 */
export interface TvShow {
  id: string;
  title: string;
  tmdbId: string | null;
  tvdbId: string | null;
  seasonCount: number | null;
  /** ISO-8601 timestamp. Validated by `TvShowSchema` via `.datetime()`. */
  lastEditedTime: string;
}

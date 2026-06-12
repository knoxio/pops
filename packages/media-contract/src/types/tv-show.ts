/**
 * A TV show in the media pillar. Pins the contract wire shape (camelCase)
 * for downstream consumers (apps, iOS Swift codegen, SDK). DB-internal
 * shape lives in `@pops/media-db` and is not surfaced through the contract.
 *
 * The contract shape deliberately diverges from the live API row served by
 * `apps/pops-api/src/modules/media/tv-shows`: that row carries ~25 fields
 * (overview, poster/backdrop/logo URLs, vote counts, genres, networks,
 * etc.) under different keys (`name`, `updatedAt`, `numberOfSeasons`),
 * while this contract pins only the fields needed to render and reference
 * a show, renamed for cross-pillar consistency (`title`, `lastEditedTime`,
 * `seasonCount`). The mapper in `apps/pops-media-api` translates from the
 * row to this shape. Extra row fields the API still emits today are not
 * part of the contract and may be removed without a contract bump.
 *
 * Wire-format note: external ids (`tmdbId`, `tvdbId`) are typed as
 * `string | null` so the contract is stable across pillars even when the
 * underlying row stores them as numbers.
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

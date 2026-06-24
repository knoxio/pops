/**
 * A TV show in the media pillar's contract wire shape (camelCase) for
 * downstream consumers (apps, iOS Swift codegen, SDK). The DB-internal
 * row shape lives in `src/db` and is not surfaced through the contract.
 *
 * External ids (`tmdbId`, `tvdbId`) are typed as `string | null` so the
 * contract is stable across pillars even when the underlying row stores
 * them as numbers.
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

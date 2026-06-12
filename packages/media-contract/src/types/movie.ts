/**
 * Pilot entity for `@pops/media-contract`. This is a deliberate stub
 * shape — id/title/year/tmdbId/lastEditedTime — sized to exercise the
 * round-trip tests + manifest + OpenAPI generators without committing
 * the contract to the full 25-field surface of the live
 * `apps/pops-api/src/modules/media/movies/types.ts` `Movie` type. The
 * production shape migrates in a follow-up PRD-153 US-07-style content
 * migration for media.
 *
 * `lastEditedTime` is an ISO-8601 timestamp validated by `MovieSchema`
 * via `.datetime()`. `tmdbId` is a string here (not the live numeric id)
 * so the contract is wire-format agnostic — the TMDB id surface across
 * pillars varies (number on movies, occasionally string on cross-source
 * shows), and string keeps the OpenAPI snapshot stable.
 */
export interface Movie {
  id: string;
  title: string;
  year: number | null;
  tmdbId: string | null;
  /** ISO-8601 timestamp. Validated by `MovieSchema` via `.datetime()`. */
  lastEditedTime: string;
}

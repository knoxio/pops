/**
 * Map a persisted movie row to the discover quick-pick wire shape.
 *
 * The shared `libraryService.getQuickPicks` returns raw movie rows; the
 * discover quick-pick wire shape adds a local poster proxy url and coalesces
 * the JSON genres column to `'[]'`. Ported from the monolith
 * `service-library.getQuickPickMovies` mapper.
 */
import type { MovieRow, QuickPickMovie } from '../../../db/index.js';

/** Map a movie row to the {@link QuickPickMovie} wire shape. */
export function toMovieQuickPick(row: MovieRow): QuickPickMovie {
  return {
    id: row.id,
    tmdbId: row.tmdbId,
    title: row.title,
    releaseDate: row.releaseDate,
    posterPath: row.posterPath,
    posterUrl: row.posterPath ? `/media/images/movie/${row.tmdbId}/poster.jpg` : null,
    backdropPath: row.backdropPath,
    overview: row.overview,
    voteAverage: row.voteAverage,
    genres: row.genres ?? '[]',
    runtime: row.runtime,
  };
}

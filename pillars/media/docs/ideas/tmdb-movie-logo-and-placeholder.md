# Idea: wire movie logo download + placeholder generation into the add-to-library flow

Status: not built (infrastructure exists, never invoked in the movie path).

The TMDB client and image cache already ship the building blocks below, but the
movie ingest path (`addMovie` / `refreshMovie` in `api/modules/library-mutations.ts`)
and the `/media/images` serving fallback never call them. Movies therefore never
get a cached logo, and a movie with no poster falls through to a 302 CDN redirect
or a 404 rather than a generated placeholder.

## Movie logo download

- `TmdbClient.getMovieImages(tmdbId)` returns logos (with `filePath`, language,
  vote score) and `ImageCacheService.downloadMovieImages(...)` accepts a
  `logoPath` and stores it at `movies/{tmdbId}/logo.png` (original size).
- Today `addMovie` / `refreshMovie` always pass `null` for the logo argument.
- Build: pick a logo from `getMovieImages` (prefer English, highest vote), pass
  its `filePath` into `downloadMovieImages`, persist `logoPath` on the movie row.
- Acceptance: adding a movie that has logos on TMDB results in
  `movies/{tmdbId}/logo.png` on disk and a non-null `logoPath` column; the
  `/media/images/movie/{tmdbId}/logo.png` byte route serves it.

## Placeholder generation in the flow

- `ImageCacheService.generatePlaceholder(tmdbId, title)` writes an SVG coloured
  rectangle (hue derived from the id) with the title as text to
  `movies/{tmdbId}/poster.jpg`. It is currently only exercised by tests.
- Build option A: during `addMovie`, when TMDB returns no poster, generate a
  placeholder so the grid always has a local image.
- Build option B: in the `/media/images` byte route, when every fallback misses
  (no cached file, no stored path, no CDN URL), generate the placeholder on the
  fly and serve it instead of returning 404.
- Acceptance: a movie added with no TMDB poster shows a coloured placeholder
  card in the library grid sourced from the local byte route, not a broken image
  or a 404.

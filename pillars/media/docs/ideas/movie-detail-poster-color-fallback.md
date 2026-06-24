# Idea: movie-detail backdrop colour fallback

When a movie has no `backdropUrl`, the hero currently falls back to a plain muted background under the standard dark-to-transparent gradient overlay. The original detail-page design called for a richer fallback: derive a colour gradient from the poster's dominant colour (or a deterministic per-title default) so backdrop-less movies still feel intentional rather than grey.

Not built. Captured here so the live PRD (`../prds/movie-detail-page/`) describes only the muted-background reality.

## Sketch

- Extract a dominant/average colour at poster-cache time (server side, when the poster is fetched into `MEDIA_IMAGES_DIR`) and persist it on the movie row, so the client doesn't pay a canvas/extraction cost on every render.
- Hero reads that colour and builds a two-stop CSS gradient for the no-backdrop case; the existing dark overlay stays on top for text contrast.
- Fall back to a deterministic default (e.g. hash of `tmdbId` → hue) when no poster exists either.

## Acceptance criteria

- [ ] Movie rows expose a stored dominant/accent colour (nullable) resolved when the poster is cached.
- [ ] No-backdrop hero renders a gradient derived from that colour instead of the flat muted background.
- [ ] Movies with neither backdrop nor poster get a deterministic default gradient, never grey.
- [ ] Text over the hero remains legible (contrast) regardless of the derived colour.

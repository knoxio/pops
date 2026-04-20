/**
 * Genre and dimension shelf implementations (US-06).
 *
 * Each shelf is its own file under `shelf/` and self-registers via {@link registerShelf}.
 * Importing this module triggers all four registrations as a side effect.
 */
export { bestInGenreShelf } from './best-in-genre.shelf.js';
export { genreCrossoverShelf } from './genre-crossover.shelf.js';
export { topDimensionShelf } from './top-dimension.shelf.js';
export { dimensionInspiredShelf } from './dimension-inspired.shelf.js';

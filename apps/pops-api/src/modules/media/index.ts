/**
 * Media domain — movies, tv shows, comparisons, watchlist, watch history, library.
 */
import { router } from '../../trpc.js';
import { moviesRouter } from './movies/router.js';

// Side-effect: register search adapters
import './search/movies-adapter.js';
import './search/tv-shows-adapter.js';
// Side-effect: register rotation source adapters
import './rotation/register-sources.js';
import { tvShowsRouter } from './tv-shows/index.js';
import { comparisonsRouter } from './comparisons/index.js';
import { watchlistRouter } from './watchlist/router.js';
import { watchHistoryRouter } from './watch-history/router.js';
import { libraryRouter } from './library/index.js';
import { searchRouter } from './search/index.js';
import { discoveryRouter } from './discovery/index.js';
import { arrRouter } from './arr/index.js';
import { plexRouter } from './plex/index.js';
import { rotationRouter } from './rotation/router.js';

export const mediaRouter = router({
  movies: moviesRouter,
  tvShows: tvShowsRouter,
  comparisons: comparisonsRouter,
  watchlist: watchlistRouter,
  watchHistory: watchHistoryRouter,
  library: libraryRouter,
  search: searchRouter,
  discovery: discoveryRouter,
  arr: arrRouter,
  plex: plexRouter,
  rotation: rotationRouter,
});

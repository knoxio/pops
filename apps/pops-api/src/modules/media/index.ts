/**
 * Media domain — movies, tv shows, comparisons, watchlist, watch history, library.
 */
// Side-effect: register search adapters
import './search/movies-adapter.js';
import './search/tv-shows-adapter.js';
// Side-effect: register rotation source adapters
import './rotation/register-sources.js';

import { featuresRegistry } from '../core/features/index.js';
import { settingsRegistry } from '../core/settings/index.js';
import { mediaFeaturesManifest } from './features.js';
import { arrManifest, plexManifest, rotationManifest } from './settings/manifests.js';
import { mediaOperationalManifest } from './settings/operational-manifest.js';

settingsRegistry.register(plexManifest);
settingsRegistry.register(arrManifest);
settingsRegistry.register(rotationManifest);
settingsRegistry.register(mediaOperationalManifest);

featuresRegistry.register(mediaFeaturesManifest);

import { router } from '../../trpc.js';
import { arrRouter } from './arr/index.js';
import { comparisonsRouter } from './comparisons/index.js';
import { discoveryRouter } from './discovery/index.js';
import { libraryRouter } from './library/index.js';
import { moviesRouter } from './movies/router.js';
import { plexRouter } from './plex/index.js';
import { rotationRouter } from './rotation/router.js';
import { searchRouter } from './search/index.js';
import { tvShowsRouter } from './tv-shows/index.js';
import { watchHistoryRouter } from './watch-history/router.js';
import { watchlistRouter } from './watchlist/router.js';

import type { ModuleManifest } from '@pops/types';

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

/**
 * PRD-098 manifest. Metadata-only; consumed by the PRD-100 loader.
 * Media owns multiple settings manifests (Plex, Arr, Rotation, Operational);
 * they remain registered via `settingsRegistry.register` above and the
 * `settings` slot is left empty until the unified registry consolidates.
 */
export const manifest: ModuleManifest<typeof mediaRouter> = {
  id: 'media',
  name: 'Media',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Movies, TV shows, watchlist, watch history, Plex/TMDB/TVDB sync.',
  backend: { router: mediaRouter },
};

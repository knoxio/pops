/**
 * Media domain — movies, tv shows, comparisons, watchlist, watch history, library.
 */
// Side-effect: register rotation source adapters
import './rotation/register-sources.js';

import {
  arrManifest,
  mediaOperationalManifest,
  plexManifest,
  rotationManifest,
} from '@pops/module-registry/settings';

import { router } from '../../trpc.js';
import { arrRouter } from './arr/index.js';
import { comparisonsRouter } from './comparisons/index.js';
import { discoveryRouter } from './discovery/index.js';
import { mediaFeaturesManifest } from './features.js';
import { libraryRouter } from './library/index.js';
import { mediaMigrations } from './migrations.js';
import { moviesRouter } from './movies/router.js';
import { plexRouter } from './plex/index.js';
import { rotationRouter } from './rotation/router.js';
import { searchRouter } from './search/index.js';
import { moviesSearchAdapter } from './search/movies-adapter.js';
import { tvShowsSearchAdapter } from './search/tv-shows-adapter.js';
import { tvShowsRouter } from './tv-shows/index.js';
import { mediaUriHandler } from './uri-handler.js';
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
 * each renders as its own section in `/settings` after PRD-101 US-04.
 */
export const manifest: ModuleManifest<typeof mediaRouter> = {
  id: 'media',
  name: 'Media',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Movies, TV shows, watchlist, watch history, Plex/TMDB/TVDB sync.',
  backend: { router: mediaRouter, migrations: mediaMigrations },
  settings: [plexManifest, arrManifest, rotationManifest, mediaOperationalManifest],
  features: [mediaFeaturesManifest],
  search: [moviesSearchAdapter, tvShowsSearchAdapter],
  uriHandler: mediaUriHandler,
};

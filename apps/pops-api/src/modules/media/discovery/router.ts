/**
 * Discovery tRPC router — preference profile, quick pick, trending, and recommendations.
 */
import './shelf/existing-shelves.js';
import './shelf/local-shelves.js';
import './shelf/tmdb-shelves.js';
import './shelf/credits-shelves.js';
import './shelf/because-you-watched.shelf.js';
import './shelf/genre-shelves.js';
import './shelf/context-shelves.js';

import { router } from '../../../trpc.js';
import { basicProcedures } from './router-basic.js';
import { sessionAndShelfProcedures } from './router-shelf.js';
import { tmdbAndContextProcedures } from './router-tmdb.js';

export const discoveryRouter = router({
  ...basicProcedures,
  ...tmdbAndContextProcedures,
  ...sessionAndShelfProcedures,
});

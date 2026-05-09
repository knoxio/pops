import { navConfig, routes } from './routes';

/**
 * Media frontend module manifest (PRD-098).
 * Metadata-only at this point — the runtime loader (PRD-100) will read it.
 */
import type { ModuleManifest } from '@pops/types';

export const manifest: ModuleManifest<unknown, typeof routes, typeof navConfig> = {
  id: 'media',
  name: 'Media',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Movies, TV shows, watch history, and Plex/TMDB/TVDB sync.',
  frontend: {
    routes,
    navConfig,
  },
};

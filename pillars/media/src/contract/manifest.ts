/**
 * Structural snapshot of the media pillar's public surface. The `MediaContract`
 * type lives in `manifest.generated.ts`; this file is the stable import path so
 * downstream consumers don't move with the generator output. Also exports the
 * runtime `mediaManifest` value consumed by the registry's discovery walk.
 */
import {
  arrManifest,
  mediaOperationalManifest,
  plexManifest,
  rotationManifest,
} from './settings/index.js';

import type { ModuleManifest } from '@pops/types';

export type { MediaContract } from './manifest.generated.js';

export const mediaManifest: ModuleManifest = {
  id: 'media',
  name: 'Media',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Movies, TV shows, watch history, and Plex/TMDB/TVDB sync.',
  settings: [plexManifest, arrManifest, rotationManifest, mediaOperationalManifest],
};

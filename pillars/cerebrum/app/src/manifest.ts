import { navConfig, routes } from './routes';

/**
 * Cerebrum frontend module manifest read by the shell's runtime loader.
 *
 * `frontend.captureOverlay` lets the shell discover the active capture
 * surface by walking every installed manifest rather than hard-importing
 * `IngestForm`. Cerebrum is the sole contributor today.
 */
import type { ModuleManifest } from '@pops/types';

export const manifest: ModuleManifest<unknown, typeof routes, typeof navConfig> = {
  id: 'cerebrum',
  name: 'Cerebrum',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Engrams, retrieval, plexus, reflex, glia — knowledge graph and agents.',
  frontend: {
    routes,
    navConfig,
    captureOverlay: {
      bundleSlot: 'ingest-form',
      order: 10,
      hotkey: 'cmd+shift+k',
      labelKey: 'cerebrum.captureOverlay.label',
    },
  },
};

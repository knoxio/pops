import { navConfig, routes } from './routes';

/**
 * Cerebrum frontend module manifest (PRD-098).
 * Metadata-only at this point — the runtime loader (PRD-100) will read it.
 *
 * PRD-246 US-03 adds `frontend.captureOverlay`: the shell discovers the
 * active capture surface by walking every installed manifest's
 * `frontend.captureOverlay` rather than hard-importing `IngestForm`.
 * Cerebrum is the sole contributor today; the descriptor mirrors the
 * wire-format payload declared in `apps/pops-cerebrum-api/src/manifest.ts`.
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

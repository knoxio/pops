import { EgoOverlay } from './EgoOverlay';

/**
 * Ego overlay module manifest (PRD-099 + PRD-101 US-07).
 *
 * Dual-surface: declares both `'overlay'` (the floating chat panel rendered
 * into a shell chrome slot) and `'app'` (the `/cerebrum/chat` route, which
 * physically lives under @pops/app-cerebrum but consumes the same chat panel
 * + hooks as the overlay). The two surfaces share conversation state via
 * the tRPC `ego.*` queries.
 *
 * Since PRD-101 US-07 the manifest also carries a lazy `component` loader
 * the shell consumes via `React.lazy` to mount the overlay into the
 * declared chrome slot without importing the overlay package directly
 * from `RootLayout`.
 */
import type { ModuleManifest } from '@pops/types';

export const EGO_OVERLAY_CHROME_SLOT = 'assistant';
export const EGO_OVERLAY_SHORTCUT = 'mod+i';

export const manifest: ModuleManifest<unknown, unknown, unknown> = {
  id: 'ego',
  name: 'Ego',
  version: '0.1.0',
  surfaces: ['overlay', 'app'],
  description: 'Conversational AI interface to Cerebrum (PRD-087).',
  frontend: {
    overlay: {
      chromeSlot: EGO_OVERLAY_CHROME_SLOT,
      shortcut: EGO_OVERLAY_SHORTCUT,
      component: () => import('./EgoOverlay').then((m) => ({ default: m.EgoOverlay })),
    },
  },
};

// Re-export the overlay component reference for the shell. We keep the
// component-typed reference out of the manifest itself so @pops/types
// doesn't need to know about React.
export const EgoOverlayComponent = EgoOverlay;

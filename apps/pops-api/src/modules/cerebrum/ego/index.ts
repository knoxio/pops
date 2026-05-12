/**
 * Ego domain — conversational AI interface to Cerebrum (PRD-087).
 *
 * Procedures:
 *   ego.conversations.create/list/get/delete — CRUD (US-05)
 *   ego.chat                                 — multi-turn conversation (US-01)
 *   ego.context.setScopes                    — explicit scope override (US-04)
 *   ego.context.getActive                    — current context state (US-03)
 */
import { egoManifest } from '@pops/module-registry/settings';

import { mergeRouters, router } from '../../../trpc.js';
import { contextRouter } from './router-context.js';
import { chatRouter, conversationsRouter } from './router.js';

import type { ModuleManifest } from '@pops/types';

export const egoRouter = mergeRouters(
  chatRouter,
  router({
    conversations: conversationsRouter,
    context: contextRouter,
  })
);

/**
 * PRD-098 manifest. Metadata-only; consumed by the PRD-100 loader.
 * Ego is dual-surface (PRD-099): the frontend manifest in `packages/overlay-ego`
 * declares `surfaces: ['app', 'overlay']`. The backend module declares only `app`
 * because there is no separate "overlay backend" concept.
 */
export const manifest: ModuleManifest<typeof egoRouter> = {
  id: 'ego',
  name: 'Ego',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Conversational AI interface to Cerebrum (PRD-087).',
  backend: { router: egoRouter },
  settings: [egoManifest],
};

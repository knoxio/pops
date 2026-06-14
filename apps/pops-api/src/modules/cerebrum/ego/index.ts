/**
 * Ego domain — conversational AI interface to Cerebrum (PRD-087).
 *
 * Procedures:
 *   ego.conversations.create/list/get/delete — CRUD (US-05)
 *   ego.chat                                 — multi-turn conversation (US-01)
 *   ego.context.setScopes                    — explicit scope override (US-04)
 *   ego.context.getActive                    — current context state (US-03)
 */
import { egoManifest as ownEgoManifest } from '@pops/cerebrum-contract/settings';
import { discoverSettings, findSettingsManifest } from '@pops/pillar-sdk/settings';

import { mergeRouters, router } from '../../../trpc.js';
import { getLocalSettingsDiscoverySnapshot } from '../../settings-discovery-snapshot.js';
import { contextRouter } from './router-context.js';
import { chatRouter, conversationsRouter } from './router.js';

import type { ModuleManifest, SettingsManifest } from '@pops/types';

export const egoRouter = mergeRouters(
  chatRouter,
  router({
    conversations: conversationsRouter,
    context: contextRouter,
  })
);

const discoveredSettings = await discoverSettings({
  discovery: getLocalSettingsDiscoverySnapshot(),
});

const egoSettings: SettingsManifest =
  findSettingsManifest(discoveredSettings, 'ego') ?? ownEgoManifest;

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
  settings: [egoSettings],
};

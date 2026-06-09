/**
 * Lists domain — backend module.
 *
 * Schema-only: the manifest's `backend.router` is an empty tRPC stub. Epic
 * 04 PRDs (139 onwards) fill it with the lists CRUD procedures consumed by
 * the top-level `/lists` shell module.
 *
 * See `docs/themes/07-food/prds/112-lists-schema/` for the schema spec and
 * `docs/themes/07-food/epics/04-lists-and-shopping.md` for the consumer side.
 */
import { router } from '../../trpc.js';
import { listsMigrations } from './migrations.js';

import type { ModuleManifest } from '@pops/types';

export const listsRouter = router({});

export const manifest: ModuleManifest<typeof listsRouter> = {
  id: 'lists',
  name: 'Lists',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Generic lists — shopping, packing, todo. Food is the first consumer.',
  backend: { router: listsRouter, migrations: listsMigrations },
};

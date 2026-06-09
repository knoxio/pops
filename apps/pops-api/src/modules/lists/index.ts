/**
 * Lists domain — backend module.
 *
 * PRD-139 wired the empty stub; PRD-140 fills `backend.router` with the
 * 14-procedure CRUD surface that backs the `/lists` UI. Schema + service
 * layer lives in `@pops/app-lists-db` (extracted from `@pops/app-lists`
 * along the same lines as `@pops/app-food-db`).
 *
 * See `docs/themes/07-food/prds/140-lists-crud-ui/` for the API surface and
 * `docs/themes/07-food/prds/112-lists-schema/` for the schema spec.
 */
import { listsMigrations } from './migrations.js';
import { listsRouter } from './router.js';

import type { ModuleManifest } from '@pops/types';

export { listsRouter } from './router.js';

export const manifest: ModuleManifest<typeof listsRouter> = {
  id: 'lists',
  name: 'Lists',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Generic lists — shopping, packing, todo. Food is the first consumer.',
  backend: { router: listsRouter, migrations: listsMigrations },
};

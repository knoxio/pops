/**
 * Food domain — backend module.
 *
 * Schema-only at this point: the manifest's `backend.router` is an empty
 * tRPC stub. Epic 01 PRDs (119 onwards) extend the router with real
 * procedures; subsequent Epic 00 PRDs append their migrations to
 * `migrations.ts`.
 *
 * See `docs/themes/07-food/` for the theme spec.
 */
import { router } from '../../trpc.js';
import { heroImageRouter } from './hero-image/router.js';
import { foodMigrations } from './migrations.js';

import type { ModuleManifest } from '@pops/types';

export const foodRouter = router({
  heroImage: heroImageRouter,
});

export const manifest: ModuleManifest<typeof foodRouter> = {
  id: 'food',
  name: 'Food',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Recipes, ingredients, meal planning, and multimodal ingestion.',
  backend: { router: foodRouter, migrations: foodMigrations },
};

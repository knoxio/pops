/**
 * Food domain — backend module.
 *
 * Mounts the per-domain sub-routers under `food.*`:
 *
 *   - `food.heroImage`     — PRD-124 hero image upload + thumbnail pipeline.
 *   - `food.ingest`        — PRD-125 ingestion API (BullMQ producer +
 *                            internal `workerComplete` for the worker).
 *   - `food.ingredients` / `variants` / `aliases` / `prepStates` /
 *     `substitutions` / `slugs` — PRD-122 part API data-management surface.
 *   - `food.conversions`   — PRD-123 phase B unit conversions.
 *
 * Recipe CRUD lands later via PRD-119. Migration tags owned by this module
 * are listed in `migrations.ts`.
 *
 * See `docs/themes/07-food/` for the theme spec.
 */
import { router } from '../../trpc.js';
import { conversionsRouter } from './conversions/router.js';
import { heroImageRouter } from './hero-image/router.js';
import { foodMigrations } from './migrations.js';
import { aliasesRouter } from './routers/aliases.js';
import { ingestRouter } from './routers/ingest-router.js';
import { ingredientsRouter } from './routers/ingredients.js';
import { prepStatesRouter } from './routers/prep-states.js';
import { slugsRouter } from './routers/slugs.js';
import { substitutionsRouter } from './routers/substitutions.js';
import { variantsRouter } from './routers/variants.js';

import type { ModuleManifest } from '@pops/types';

export const foodRouter = router({
  heroImage: heroImageRouter,
  ingest: ingestRouter,
  ingredients: ingredientsRouter,
  variants: variantsRouter,
  aliases: aliasesRouter,
  prepStates: prepStatesRouter,
  substitutions: substitutionsRouter,
  slugs: slugsRouter,
  conversions: conversionsRouter,
});

export const manifest: ModuleManifest<typeof foodRouter> = {
  id: 'food',
  name: 'Food',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Recipes, ingredients, meal planning, and multimodal ingestion.',
  backend: { router: foodRouter, migrations: foodMigrations },
};

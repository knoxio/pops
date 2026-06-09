/**
 * Food domain — backend module.
 *
 * PRD-122 (data management page) wires six sub-routers under `food.*`:
 * ingredients, variants, aliases, prepStates, substitutions, slugs. PRD-123
 * adds `conversions`; PRD-124 adds `heroImage`; PRD-125 adds `ingest` (the
 * ingestion-pipeline producer + internal `workerComplete` mutation). Recipe
 * mutations come later via PRD-119. The shared `slugs.search` procedure is
 * consumed by both the data page and PRD-120's DSL editor.
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

import { router } from '../../trpc.js';
import { batchesRouter } from './batches/router.js';
import { conversionsRouter } from './conversions/router.js';
import { cookRouter } from './cook/router.js';
import { fridgeRouter } from './fridge/router.js';
import { heroImageRouter } from './hero-image/router.js';
import { inboxRouter } from './inbox/router.js';
import { foodMigrations } from './migrations.js';
import { planRouter } from './plan/router.js';
import { recipesRouter } from './recipes/router.js';
import { aiRouter } from './routers/ai.js';
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
  ai: aiRouter,
  recipes: recipesRouter,
  inbox: inboxRouter,
  batches: batchesRouter,
  cook: cookRouter,
  plan: planRouter,
  fridge: fridgeRouter,
});

export const manifest: ModuleManifest<typeof foodRouter> = {
  id: 'food',
  name: 'Food',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Recipes, ingredients, meal planning, and multimodal ingestion.',
  backend: { router: foodRouter, migrations: foodMigrations },
};

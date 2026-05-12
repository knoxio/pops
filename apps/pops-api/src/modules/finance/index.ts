import { financeManifest } from '@pops/module-registry/settings';

/**
 * Finance domain — transactions, budgets, imports, wishlist.
 */
import { router } from '../../trpc.js';
import { budgetsRouter } from './budgets/router.js';
import { budgetsSearchAdapter } from './budgets/search-adapter.js';
import { importsRouter } from './imports/router.js';
import { financeMigrations } from './migrations.js';
import { transactionsRouter } from './transactions/router.js';
import { transactionsSearchAdapter } from './transactions/search-adapter.js';
import { financeUriHandler } from './uri-handler.js';
import { wishlistRouter } from './wishlist/router.js';
import { wishlistSearchAdapter } from './wishlist/search-adapter.js';

import type { ModuleManifest } from '@pops/types';

export const financeRouter = router({
  transactions: transactionsRouter,
  budgets: budgetsRouter,
  imports: importsRouter,
  wishlist: wishlistRouter,
});

/** PRD-098 manifest. Metadata-only; consumed by the PRD-100 loader. */
export const manifest: ModuleManifest<typeof financeRouter> = {
  id: 'finance',
  name: 'Finance',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Transactions, budgets, entities, and import pipeline.',
  backend: { router: financeRouter, migrations: financeMigrations },
  settings: [financeManifest],
  search: [transactionsSearchAdapter, budgetsSearchAdapter, wishlistSearchAdapter],
  uriHandler: financeUriHandler,
};

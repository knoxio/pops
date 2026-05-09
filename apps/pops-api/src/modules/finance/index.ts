/**
 * Finance domain — transactions, budgets, imports, wishlist.
 */
// Side-effect: register search adapters
import './transactions/search-adapter.js';
import './budgets/search-adapter.js';
import './wishlist/search-adapter.js';

import { settingsRegistry } from '../core/settings/index.js';
import { financeManifest } from './settings-manifest.js';

settingsRegistry.register(financeManifest);

import { router } from '../../trpc.js';
import { budgetsRouter } from './budgets/router.js';
import { importsRouter } from './imports/router.js';
import { transactionsRouter } from './transactions/router.js';
import { wishlistRouter } from './wishlist/router.js';

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
  backend: { router: financeRouter },
  settings: financeManifest,
};

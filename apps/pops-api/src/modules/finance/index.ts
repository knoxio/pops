import { financeManifest as ownFinanceManifest } from '@pops/finance-contract/settings';
import { discoverSettings, findSettingsManifest } from '@pops/pillar-sdk/settings';

/**
 * Finance domain — transactions, budgets, imports, wishlist.
 */
import { router } from '../../trpc.js';
import { getLocalSettingsDiscoverySnapshot } from '../settings-discovery-snapshot.js';
import { budgetsRouter } from './budgets/router.js';
import { importsRouter } from './imports/router.js';
import { financeMigrations } from './migrations.js';
import { transactionsRouter } from './transactions/router.js';
import { financeUriHandler } from './uri-handler.js';
import { wishlistRouter } from './wishlist/router.js';

import type { ModuleManifest, SettingsManifest } from '@pops/types';

export const financeRouter = router({
  transactions: transactionsRouter,
  budgets: budgetsRouter,
  imports: importsRouter,
  wishlist: wishlistRouter,
});

const discoveredSettings = await discoverSettings({
  discovery: getLocalSettingsDiscoverySnapshot(),
});

const financeSettings: SettingsManifest =
  findSettingsManifest(discoveredSettings, 'finance') ?? ownFinanceManifest;

/** PRD-098 manifest. Metadata-only; consumed by the PRD-100 loader. */
export const manifest: ModuleManifest<typeof financeRouter> = {
  id: 'finance',
  name: 'Finance',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Transactions, budgets, entities, and import pipeline.',
  backend: { router: financeRouter, migrations: financeMigrations },
  settings: [financeSettings],
  uriHandler: financeUriHandler,
};

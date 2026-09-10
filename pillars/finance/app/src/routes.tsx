/**
 * Finance app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports these via
 * @pops/app-finance and mounts them under /finance/*.
 *
 * There are two ways into these components. The shell's runtime loader
 * resolves a `PageDescriptor.bundleSlot` against the `bundles` record in
 * `./bundles`; the static bundle map mounts `routes` directly. Both read
 * `PAGE_COMPONENTS` below, so the two cannot disagree about which component a
 * page is.
 *
 * The route table is spelled out rather than derived from `FINANCE_PAGES`, and
 * the repetition is the price of a table that can be read without being
 * executed: `scripts/check-title-icon-consistency.mjs` resolves a nav item to
 * its page by parsing these `element` tags, and a derived table resolves
 * nothing — the gate would go on passing while checking no finance page at
 * all. `__tests__/bundles.test.ts` holds the two in step instead.
 */
import { lazy } from 'react';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { FinancePageSlot } from '@pops/finance/manifest';

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const TransactionsPage = lazy(() =>
  import('./pages/TransactionsPage').then((m) => ({
    default: m.TransactionsPage,
  }))
);
const EntitiesPage = lazy(() =>
  import('./pages/EntitiesPage').then((m) => ({ default: m.EntitiesPage }))
);
const EntityDetailPage = lazy(() =>
  import('./pages/EntityDetailPage').then((m) => ({ default: m.EntityDetailPage }))
);
const AccountsPage = lazy(() =>
  import('./pages/AccountsPage').then((m) => ({ default: m.AccountsPage }))
);
const AccountDetailPage = lazy(() =>
  import('./pages/AccountDetailPage').then((m) => ({ default: m.AccountDetailPage }))
);
const AccountCheckpointsPage = lazy(() =>
  import('./pages/AccountCheckpointsPage').then((m) => ({ default: m.AccountCheckpointsPage }))
);
const AccountImportsPage = lazy(() =>
  import('./pages/AccountImportsPage').then((m) => ({ default: m.AccountImportsPage }))
);
const BudgetsPage = lazy(() =>
  import('./pages/BudgetsPage').then((m) => ({ default: m.BudgetsPage }))
);
const WishlistPage = lazy(() =>
  import('./pages/WishlistPage').then((m) => ({ default: m.WishlistPage }))
);
const ImportPage = lazy(() =>
  import('./pages/ImportPage').then((m) => ({ default: m.ImportPage }))
);
const RulesBrowserPage = lazy(() =>
  import('./pages/RulesBrowserPage').then((m) => ({ default: m.RulesBrowserPage }))
);
const TagRulesBrowserPage = lazy(() =>
  import('./pages/TagRulesBrowserPage').then((m) => ({ default: m.TagRulesBrowserPage }))
);
const PromptViewerPage = lazy(() =>
  import('./pages/PromptViewerPage').then((m) => ({ default: m.PromptViewerPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

export { navConfig } from './nav';

/**
 * The component behind each page, keyed by the bundle slot the pillar's
 * manifest advertises for it.
 *
 * Keyed by slot rather than by path because that is the key the shell's
 * runtime loader asks for, and `satisfies` then pins the key set in both
 * directions: a page added to `FINANCE_PAGES` with nothing to render fails to
 * compile here, and a component bound to a slot the contract does not declare
 * fails the same way. `bundles` is this map under the name the wire uses.
 */
export const PAGE_COMPONENTS = {
  'finance-dashboard': DashboardPage,
  'finance-transactions': TransactionsPage,
  'finance-entities': EntitiesPage,
  'finance-entity-detail': EntityDetailPage,
  'finance-accounts': AccountsPage,
  'finance-account-detail': AccountDetailPage,
  'finance-account-checkpoints': AccountCheckpointsPage,
  'finance-account-imports': AccountImportsPage,
  'finance-budgets': BudgetsPage,
  'finance-wishlist': WishlistPage,
  'finance-import': ImportPage,
  'finance-rules': RulesBrowserPage,
  'finance-tag-rules': TagRulesBrowserPage,
  'finance-prompts': PromptViewerPage,
  'finance-settings': SettingsPage,
} satisfies Record<FinancePageSlot, ComponentType>;

export const routes: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  { path: 'transactions', element: <TransactionsPage /> },
  { path: 'entities', element: <EntitiesPage /> },
  { path: 'entities/:id', element: <EntityDetailPage /> },
  { path: 'accounts', element: <AccountsPage /> },
  { path: 'accounts/:id', element: <AccountDetailPage /> },
  { path: 'accounts/:id/checkpoints', element: <AccountCheckpointsPage /> },
  { path: 'accounts/:id/imports', element: <AccountImportsPage /> },
  { path: 'budgets', element: <BudgetsPage /> },
  { path: 'wishlist', element: <WishlistPage /> },
  { path: 'import', element: <ImportPage /> },
  { path: 'rules', element: <RulesBrowserPage /> },
  { path: 'tag-rules', element: <TagRulesBrowserPage /> },
  { path: 'prompts', element: <PromptViewerPage /> },
  { path: 'settings', element: <SettingsPage /> },
];

/**
 * Finance app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-finance and mounts them under /finance/*.
 */
import { lazy } from 'react';

import type { RouteObject } from 'react-router';

import type { IconName } from '@pops/navigation';

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
const BudgetsPage = lazy(() =>
  import('./pages/BudgetsPage').then((m) => ({ default: m.BudgetsPage }))
);
const WishlistPage = lazy(() =>
  import('./pages/WishlistPage').then((m) => ({ default: m.WishlistPage }))
);
const ImportPage = lazy(() =>
  import('./pages/ImportPage').then((m) => ({ default: m.ImportPage }))
);
/** Local type mirror for compile-time safety (shell owns the canonical types). */
interface AppNavConfigShape {
  id: string;
  label: string;
  labelKey: string;
  icon: IconName;
  color?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'violet';
  basePath: string;
  items: { path: string; label: string; labelKey: string; icon: IconName }[];
}

export const navConfig = {
  id: 'finance',
  label: 'Finance',
  labelKey: 'finance',
  icon: 'DollarSign',
  color: 'emerald',
  basePath: '/finance',
  items: [
    { path: '', label: 'Dashboard', labelKey: 'finance.dashboard', icon: 'LayoutDashboard' },
    {
      path: '/transactions',
      label: 'Transactions',
      labelKey: 'finance.transactions',
      icon: 'CreditCard',
    },
    { path: '/entities', label: 'Entities', labelKey: 'finance.entities', icon: 'Building2' },
    { path: '/budgets', label: 'Budgets', labelKey: 'finance.budgets', icon: 'PiggyBank' },
    { path: '/wishlist', label: 'Wish List', labelKey: 'finance.wishList', icon: 'Star' },
    { path: '/import', label: 'Import', labelKey: 'finance.import', icon: 'Download' },
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  { path: 'transactions', element: <TransactionsPage /> },
  { path: 'entities', element: <EntitiesPage /> },
  { path: 'budgets', element: <BudgetsPage /> },
  { path: 'wishlist', element: <WishlistPage /> },
  { path: 'import', element: <ImportPage /> },
];

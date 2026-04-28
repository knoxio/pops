/**
 * Inventory app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-inventory and mounts them under /inventory/*.
 */
import { lazy } from 'react';

import type { RouteObject } from 'react-router';

import type { IconName } from '@pops/navigation';

const ItemsPage = lazy(() => import('./pages/ItemsPage').then((m) => ({ default: m.ItemsPage })));
const ItemDetailPage = lazy(() =>
  import('./pages/ItemDetailPage').then((m) => ({
    default: m.ItemDetailPage,
  }))
);
const ItemFormPage = lazy(() =>
  import('./pages/ItemFormPage').then((m) => ({ default: m.ItemFormPage }))
);
const WarrantiesPage = lazy(() =>
  import('./pages/WarrantiesPage').then((m) => ({
    default: m.WarrantiesPage,
  }))
);
const ReportDashboardPage = lazy(() =>
  import('./pages/ReportDashboardPage').then((m) => ({
    default: m.ReportDashboardPage,
  }))
);
const InsuranceReportPage = lazy(() =>
  import('./pages/InsuranceReportPage').then((m) => ({
    default: m.InsuranceReportPage,
  }))
);
const LocationTreePage = lazy(() =>
  import('./pages/LocationTreePage').then((m) => ({
    default: m.LocationTreePage,
  }))
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
  id: 'inventory',
  label: 'Inventory',
  labelKey: 'inventory',
  icon: 'Package',
  color: 'amber',
  basePath: '/inventory',
  items: [
    { path: '', label: 'Items', labelKey: 'inventory.items', icon: 'Package' },
    {
      path: '/warranties',
      label: 'Warranties',
      labelKey: 'inventory.warranties',
      icon: 'ShieldCheck',
    },
    { path: '/locations', label: 'Locations', labelKey: 'inventory.locations', icon: 'MapPin' },
    { path: '/report', label: 'Reports', labelKey: 'inventory.reports', icon: 'BarChart3' },
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <ItemsPage /> },
  { path: 'items/new', element: <ItemFormPage /> },
  { path: 'items/:id', element: <ItemDetailPage /> },
  { path: 'items/:id/edit', element: <ItemFormPage /> },
  { path: 'warranties', element: <WarrantiesPage /> },
  { path: 'locations', element: <LocationTreePage /> },
  {
    path: 'report',
    children: [
      { index: true, element: <ReportDashboardPage /> },
      { path: 'insurance', element: <InsuranceReportPage /> },
    ],
  },
];

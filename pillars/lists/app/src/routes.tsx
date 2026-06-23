import { lazy } from 'react';

import type { RouteObject } from 'react-router';

const ListsIndexPage = lazy(() =>
  import('./pages/ListsIndexPage').then((m) => ({ default: m.ListsIndexPage }))
);

const ListDetailPage = lazy(() =>
  import('./pages/ListDetailPage').then((m) => ({ default: m.ListDetailPage }))
);

/**
 * Local type mirror for compile-time safety (shell owns the canonical types).
 *
 * `IconName` here is the narrow set of icons app-lists actually references,
 * NOT the `@pops/navigation` union: a static dep on `@pops/navigation` would
 * close a `tsc -b` project-reference cycle (`app-food-db` → `app-lists` → `navigation` →
 * `api-client` → `api` → `app-food-db`). Each literal here must also exist
 * in the navigation `IconName` union and the shell `iconMap` — assignability
 * (literal → wider union) catches drift at the shell's `AppNavConfig[]`
 * boundary.
 */
type IconName = 'ListChecks' | 'LayoutDashboard';
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
  id: 'lists',
  label: 'Lists',
  labelKey: 'lists',
  icon: 'ListChecks',
  color: 'sky',
  basePath: '/lists',
  items: [
    { path: '', label: 'Home', labelKey: 'lists.home', icon: 'LayoutDashboard' },
    // Detail pages (`/lists/:id`) are deep links, not sidebar entries.
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <ListsIndexPage /> },
  { path: ':id', element: <ListDetailPage /> },
];

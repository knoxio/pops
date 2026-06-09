import { lazy } from 'react';

import type { RouteObject } from 'react-router';

const ListsLandingPage = lazy(() =>
  import('./pages/ListsLandingPage').then((m) => ({ default: m.ListsLandingPage }))
);

/**
 * Local type mirror for compile-time safety (shell owns the canonical types).
 *
 * `IconName` here is the narrow set of icons app-lists actually references,
 * NOT the `@pops/navigation` union: a static dep on `@pops/navigation` would
 * close a turbo build cycle (`app-food-db` → `app-lists` → `navigation` →
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
    // Index + detail + new routes added by PRD-140 once CRUD lands.
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [{ index: true, element: <ListsLandingPage /> }];

import { lazy } from 'react';

import type { RouteObject } from 'react-router';

import type { IconName } from '@pops/navigation';

const ListsLandingPage = lazy(() =>
  import('./pages/ListsLandingPage').then((m) => ({ default: m.ListsLandingPage }))
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

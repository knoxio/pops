import { lazy } from 'react';

import type { RouteObject } from 'react-router';

import type { IconName } from '@pops/navigation';

const FoodLandingPage = lazy(() =>
  import('./pages/FoodLandingPage').then((m) => ({ default: m.FoodLandingPage }))
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
  id: 'food',
  label: 'Food',
  labelKey: 'food',
  icon: 'Utensils',
  color: 'amber',
  basePath: '/food',
  items: [
    { path: '', label: 'Home', labelKey: 'food.home', icon: 'LayoutDashboard' },
    // Sub-nav populated as Epic 01 PRDs land:
    //   /food/recipes  - Recipes (PRD-119)
    //   /food/data     - Manage data (PRD-122)
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [{ index: true, element: <FoodLandingPage /> }];

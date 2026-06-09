import { lazy } from 'react';
import { Navigate } from 'react-router';

import type { RouteObject } from 'react-router';

import type { IconName } from '@pops/navigation';

const FoodLandingPage = lazy(() =>
  import('./pages/FoodLandingPage').then((m) => ({ default: m.FoodLandingPage }))
);
const FoodDataLayout = lazy(() =>
  import('./pages/data/FoodDataLayout').then((m) => ({ default: m.FoodDataLayout }))
);
const IngredientsTab = lazy(() =>
  import('./pages/data/IngredientsTab').then((m) => ({ default: m.IngredientsTab }))
);
const AliasesTab = lazy(() =>
  import('./pages/data/AliasesTab').then((m) => ({ default: m.AliasesTab }))
);
const PrepStatesTab = lazy(() =>
  import('./pages/data/PrepStatesTab').then((m) => ({ default: m.PrepStatesTab }))
);
const SubstitutionsTab = lazy(() =>
  import('./pages/data/SubstitutionsTab').then((m) => ({ default: m.SubstitutionsTab }))
);
const ConversionsTab = lazy(() =>
  import('./pages/data/ConversionsTab').then((m) => ({ default: m.ConversionsTab }))
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
    { path: '/data', label: 'Manage data', labelKey: 'food.data', icon: 'Database' },
    // Recipes sub-nav populated by PRD-119.
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <FoodLandingPage /> },
  {
    path: 'data',
    element: <FoodDataLayout />,
    children: [
      { index: true, element: <Navigate to="ingredients" replace /> },
      { path: 'ingredients', element: <IngredientsTab /> },
      { path: 'aliases', element: <AliasesTab /> },
      { path: 'prep-states', element: <PrepStatesTab /> },
      { path: 'substitutions', element: <SubstitutionsTab /> },
      { path: 'conversions', element: <ConversionsTab /> },
    ],
  },
];

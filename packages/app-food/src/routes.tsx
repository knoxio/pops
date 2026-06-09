import { lazy } from 'react';
import { Navigate } from 'react-router';

import type { RouteObject } from 'react-router';

/**
 * Local mirror of the shell's `IconName` union. The shell owns the canonical
 * vocabulary in `@pops/navigation/src/types.ts`; this copy is kept in sync
 * because depending on `@pops/navigation` would re-introduce a build cycle
 * with `@pops/api` via `@pops/api-client`. If a new icon ships in
 * `@pops/navigation`, mirror it here when this package needs to reference it.
 */
type IconName =
  | 'Activity'
  | 'ArrowLeftRight'
  | 'BarChart3'
  | 'Bell'
  | 'Bookmark'
  | 'BookOpen'
  | 'Bot'
  | 'Building2'
  | 'Clock'
  | 'Compass'
  | 'CreditCard'
  | 'Database'
  | 'DollarSign'
  | 'Download'
  | 'FileText'
  | 'Film'
  | 'GitPullRequest'
  | 'History'
  | 'Layers'
  | 'LayoutDashboard'
  | 'Library'
  | 'MapPin'
  | 'MessageSquare'
  | 'Network'
  | 'Package'
  | 'PiggyBank'
  | 'Plug'
  | 'Search'
  | 'Settings'
  | 'ShieldCheck'
  | 'Shuffle'
  | 'Star'
  | 'Trophy'
  | 'Utensils'
  | 'Zap';

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
const SubGraphPage = lazy(() =>
  import('./pages/data/substitutions-graph/SubGraphPage').then((m) => ({ default: m.SubGraphPage }))
);
const ConversionsTab = lazy(() =>
  import('./pages/data/ConversionsTab').then((m) => ({ default: m.ConversionsTab }))
);
const PromptViewerPage = lazy(() =>
  import('./pages/PromptViewerPage').then((m) => ({ default: m.PromptViewerPage }))
);
const RecipeListPage = lazy(() =>
  import('./pages/recipes/RecipeListPage').then((m) => ({ default: m.RecipeListPage }))
);
const RecipePagePlaceholder = lazy(() =>
  import('./pages/recipes/RecipePagePlaceholder').then((m) => ({
    default: m.RecipePagePlaceholder,
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
  id: 'food',
  label: 'Food',
  labelKey: 'food',
  icon: 'Utensils',
  color: 'amber',
  basePath: '/food',
  items: [
    { path: '', label: 'Home', labelKey: 'food.home', icon: 'LayoutDashboard' },
    { path: '/recipes', label: 'Recipes', labelKey: 'food.recipes', icon: 'BookOpen' },
    { path: '/data', label: 'Manage data', labelKey: 'food.data', icon: 'Database' },
    { path: '/prompts', label: 'Prompts', labelKey: 'food.prompts', icon: 'FileText' },
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
      // PRD-148: graph visualisation lives at /food/data/substitutions/graph.
      // Declared as a sibling under `data` (not nested under `substitutions`)
      // so the active-tab resolver in FoodDataLayout still highlights the
      // Substitutions tab while the graph subroute is open.
      { path: 'substitutions/graph', element: <SubGraphPage /> },
      { path: 'conversions', element: <ConversionsTab /> },
    ],
  },
  // PRD-119 — recipe CRUD pages. 119-A mounts the list page + placeholders
  // for routes that 119-B/C/D will fill (detail, new, edit, drafts,
  // historic versions). Wiring the routes up-front keeps internal links
  // from breaking during the staged rollout.
  { path: 'recipes', element: <RecipeListPage /> },
  { path: 'recipes/new', element: <RecipePagePlaceholder /> },
  { path: 'recipes/:slug', element: <RecipePagePlaceholder /> },
  { path: 'recipes/:slug/v/:versionNo', element: <RecipePagePlaceholder /> },
  { path: 'recipes/:slug/edit', element: <RecipePagePlaceholder /> },
  { path: 'recipes/:slug/drafts', element: <RecipePagePlaceholder /> },
  { path: 'recipes/:slug/drafts/:draftNo', element: <RecipePagePlaceholder /> },
  { path: 'prompts', element: <PromptViewerPage /> },
];

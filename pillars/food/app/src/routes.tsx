import { lazy } from 'react';
import { Navigate } from 'react-router';

import type { RouteObject } from 'react-router';

/**
 * Local mirror of the shell's `IconName` union. The canonical vocabulary lives
 * in `@pops/navigation` (libs/navigation/src/types.ts); this copy is mirrored to
 * avoid a build cycle. When a new icon ships there, mirror it here if this
 * package needs to reference it.
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
  | 'ListChecks'
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
const TagsTab = lazy(() =>
  import('./pages/data/tags-tab/TagsTab').then((m) => ({ default: m.TagsTab }))
);
const PromptViewerPage = lazy(() =>
  import('./pages/PromptViewerPage').then((m) => ({ default: m.PromptViewerPage }))
);
const RecipeListPage = lazy(() =>
  import('./pages/recipes/RecipeListPage').then((m) => ({ default: m.RecipeListPage }))
);
const RecipeDetailPage = lazy(() =>
  import('./pages/recipes/RecipeDetailPage').then((m) => ({ default: m.RecipeDetailPage }))
);
const RecipeVersionDetailPage = lazy(() =>
  import('./pages/recipes/RecipeVersionDetailPage').then((m) => ({
    default: m.RecipeVersionDetailPage,
  }))
);
const RecipeNewPage = lazy(() =>
  import('./pages/recipes/RecipeNewPage').then((m) => ({ default: m.RecipeNewPage }))
);
const RecipeEditPage = lazy(() =>
  import('./pages/recipes/RecipeEditPage').then((m) => ({ default: m.RecipeEditPage }))
);
const RecipeDraftsPage = lazy(() =>
  import('./pages/recipes/RecipeDraftsPage').then((m) => ({ default: m.RecipeDraftsPage }))
);
const RecipeDraftEditPage = lazy(() =>
  import('./pages/recipes/RecipeDraftEditPage').then((m) => ({ default: m.RecipeDraftEditPage }))
);
const PlanPage = lazy(() => import('./pages/plan/PlanPage').then((m) => ({ default: m.PlanPage })));
const FridgePage = lazy(() =>
  import('./pages/fridge/FridgePage').then((m) => ({ default: m.FridgePage }))
);
const FromPlanPage = lazy(() =>
  import('./pages/shopping/FromPlanPage').then((m) => ({ default: m.FromPlanPage }))
);
const SolvePage = lazy(() =>
  import('./pages/solve/SolvePage').then((m) => ({ default: m.SolvePage }))
);
const InboxPage = lazy(() =>
  import('./pages/inbox/InboxPage').then((m) => ({ default: m.InboxPage }))
);
const InspectorPage = lazy(() =>
  import('./pages/inbox/inspector/InspectorPage').then((m) => ({ default: m.InspectorPage }))
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
    { path: '/inbox', label: 'Inbox', labelKey: 'food.inbox', icon: 'Bell' },
    { path: '/plan', label: 'Plan', labelKey: 'food.plan', icon: 'Clock' },
    { path: '/fridge', label: 'Fridge', labelKey: 'food.fridge', icon: 'Package' },
    { path: '/solve', label: 'Solve', labelKey: 'food.solve', icon: 'Compass' },
    {
      path: '/shopping/from-plan',
      label: 'Shopping',
      labelKey: 'food.shopping',
      icon: 'ListChecks',
    },
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
      // Declared as a sibling under `data` (not nested under `substitutions`)
      // so the active-tab resolver in FoodDataLayout still highlights the
      // Substitutions tab while the graph subroute is open.
      // (pillars/food/docs/prds/substitution-graph-explorer)
      { path: 'substitutions/graph', element: <SubGraphPage /> },
      { path: 'conversions', element: <ConversionsTab /> },
      // Read-only vocabulary view; the per-ingredient chip editor lives inside
      // the Ingredients tab's detail panel.
      { path: 'tags', element: <TagsTab /> },
    ],
  },
  { path: 'recipes', element: <RecipeListPage /> },
  { path: 'recipes/new', element: <RecipeNewPage /> },
  { path: 'recipes/:slug', element: <RecipeDetailPage /> },
  { path: 'recipes/:slug/v/:versionNo', element: <RecipeVersionDetailPage /> },
  { path: 'recipes/:slug/edit', element: <RecipeEditPage /> },
  { path: 'recipes/:slug/drafts', element: <RecipeDraftsPage /> },
  { path: 'recipes/:slug/drafts/:draftNo', element: <RecipeDraftEditPage /> },
  { path: 'prompts', element: <PromptViewerPage /> },
  { path: 'plan', element: <PlanPage /> },
  { path: 'fridge', element: <FridgePage /> },
  { path: 'solve', element: <SolvePage /> },
  { path: 'shopping/from-plan', element: <FromPlanPage /> },
  { path: 'inbox', element: <InboxPage /> },
  // `:sourceId` opens the three-pane provenance / editor / decision inspector.
  { path: 'inbox/:sourceId', element: <InspectorPage /> },
];

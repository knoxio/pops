/**
 * AI app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-ai and mounts them under /ai/*.
 */
import { lazy } from 'react';

import type { RouteObject } from 'react-router';

const AiUsagePage = lazy(() =>
  import('./pages/AiUsagePage').then((m) => ({ default: m.AiUsagePage }))
);

const PromptViewerPage = lazy(() =>
  import('./pages/PromptViewerPage').then((m) => ({ default: m.PromptViewerPage }))
);

const ModelConfigPage = lazy(() =>
  import('./pages/ModelConfigPage').then((m) => ({ default: m.ModelConfigPage }))
);

const RulesBrowserPage = lazy(() =>
  import('./pages/RulesBrowserPage').then((m) => ({ default: m.RulesBrowserPage }))
);

const CacheManagementPage = lazy(() =>
  import('./pages/CacheManagementPage').then((m) => ({ default: m.CacheManagementPage }))
);

/** Shared navigation types (mirrored from shell to avoid circular dependency) */
export interface AppNavItem {
  path: string;
  label: string;
  icon: string;
}

export interface AppNavConfig {
  id: string;
  label: string;
  icon: string;
  color?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'violet';
  basePath: string;
  items: AppNavItem[];
}

export const navConfig: AppNavConfig = {
  id: 'ai',
  label: 'AI',
  icon: 'Bot',
  color: 'violet',
  basePath: '/ai',
  items: [
    { path: '', label: 'AI Usage', icon: 'BarChart3' },
    { path: '/prompts', label: 'Prompt Templates', icon: 'FileText' },
    { path: '/config', label: 'Model Config', icon: 'Settings' },
    { path: '/rules', label: 'Rules', icon: 'BookOpen' },
    { path: '/cache', label: 'Cache', icon: 'Database' },
  ],
};

export const routes: RouteObject[] = [
  { index: true, element: <AiUsagePage /> },
  { path: 'prompts', element: <PromptViewerPage /> },
  { path: 'config', element: <ModelConfigPage /> },
  { path: 'rules', element: <RulesBrowserPage /> },
  { path: 'cache', element: <CacheManagementPage /> },
];

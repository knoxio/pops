/**
 * AI app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-ai and mounts them under /ai/*.
 */
import { lazy } from 'react';
import { Navigate } from 'react-router';

import type { RouteObject } from 'react-router';

import type { IconName } from '@pops/navigation';

const AiUsagePage = lazy(() =>
  import('./pages/AiUsagePage').then((m) => ({ default: m.AiUsagePage }))
);

const PromptViewerPage = lazy(() =>
  import('./pages/PromptViewerPage').then((m) => ({ default: m.PromptViewerPage }))
);

const RulesBrowserPage = lazy(() =>
  import('./pages/RulesBrowserPage').then((m) => ({ default: m.RulesBrowserPage }))
);

const CacheManagementPage = lazy(() =>
  import('./pages/CacheManagementPage').then((m) => ({ default: m.CacheManagementPage }))
);

/** Local type mirror for compile-time safety (shell owns the canonical types). */
interface AppNavConfigShape {
  id: string;
  label: string;
  icon: IconName;
  color?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'violet';
  basePath: string;
  items: { path: string; label: string; icon: IconName }[];
}

export const navConfig = {
  id: 'ai',
  label: 'AI',
  icon: 'Bot',
  color: 'violet',
  basePath: '/ai',
  items: [
    { path: '', label: 'AI Usage', icon: 'BarChart3' },
    { path: '/prompts', label: 'Prompt Templates', icon: 'FileText' },
    { path: '/rules', label: 'Rules', icon: 'BookOpen' },
    { path: '/cache', label: 'Cache', icon: 'Database' },
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <AiUsagePage /> },
  { path: 'prompts', element: <PromptViewerPage /> },
  { path: 'config', element: <Navigate to="/settings#ai.config" replace /> },
  { path: 'rules', element: <RulesBrowserPage /> },
  { path: 'cache', element: <CacheManagementPage /> },
];

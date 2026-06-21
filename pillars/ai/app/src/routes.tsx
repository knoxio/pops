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

const CacheManagementPage = lazy(() =>
  import('./pages/CacheManagementPage').then((m) => ({ default: m.CacheManagementPage }))
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
  id: 'ai',
  label: 'AI',
  labelKey: 'ai',
  icon: 'Bot',
  color: 'violet',
  basePath: '/ai',
  items: [
    { path: '', label: 'AI Usage', labelKey: 'ai.usage', icon: 'BarChart3' },
    { path: '/cache', label: 'Cache', labelKey: 'ai.cache', icon: 'Database' },
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <AiUsagePage /> },
  { path: 'prompts', element: <Navigate to="/finance/prompts" replace /> },
  { path: 'config', element: <Navigate to="/settings#ai.config" replace /> },
  { path: 'rules', element: <Navigate to="/finance/rules" replace /> },
  { path: 'cache', element: <CacheManagementPage /> },
];

/**
 * Cerebrum app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-cerebrum and mounts them under /cerebrum/*.
 */
import { lazy } from 'react';

import type { RouteObject } from 'react-router';

import type { IconName } from '@pops/navigation';

const IngestPage = lazy(() =>
  import('./pages/IngestPage').then((m) => ({ default: m.IngestPage }))
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
  id: 'cerebrum',
  label: 'Cerebrum',
  icon: 'BookOpen',
  color: 'sky',
  basePath: '/cerebrum',
  items: [{ path: '', label: 'Ingest', icon: 'FileText' }],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [{ index: true, element: <IngestPage /> }];

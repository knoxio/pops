/**
 * Cerebrum app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-cerebrum and mounts them under /cerebrum/*.
 *
 * AI admin pages (usage, prompts, rules, cache) are mounted under
 * /cerebrum/admin/* — imported from @pops/app-ai.
 */
import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router';

import { routes as aiAdminRoutes } from '@pops/app-ai';

import type { RouteObject } from 'react-router';

import type { IconName } from '@pops/navigation';

const IngestPage = lazy(() =>
  import('./pages/IngestPage').then((m) => ({ default: m.IngestPage }))
);
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const NudgesPage = lazy(() =>
  import('./pages/NudgesPage').then((m) => ({ default: m.NudgesPage }))
);
const ProposalQueuePage = lazy(() =>
  import('./pages/ProposalQueuePage').then((m) => ({ default: m.ProposalQueuePage }))
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
  id: 'cerebrum',
  label: 'Cerebrum',
  labelKey: 'cerebrum',
  icon: 'BookOpen',
  color: 'sky',
  basePath: '/cerebrum',
  items: [
    { path: '', label: 'Ingest', labelKey: 'cerebrum.ingest', icon: 'FileText' },
    { path: '/nudges', label: 'Nudges', labelKey: 'cerebrum.nudges', icon: 'Bell' },
    {
      path: '/proposals',
      label: 'Proposals',
      labelKey: 'cerebrum.proposals',
      icon: 'GitPullRequest',
    },
    { path: '/admin', label: 'AI Usage', labelKey: 'cerebrum.admin.usage', icon: 'BarChart3' },
    {
      path: '/admin/prompts',
      label: 'Prompt Templates',
      labelKey: 'cerebrum.admin.promptTemplates',
      icon: 'FileText',
    },
    { path: '/admin/rules', label: 'Rules', labelKey: 'cerebrum.admin.rules', icon: 'BookOpen' },
    { path: '/admin/cache', label: 'Cache', labelKey: 'cerebrum.admin.cache', icon: 'Database' },
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <IngestPage /> },
  { path: 'chat', element: <ChatPage /> },
  { path: 'nudges', element: <NudgesPage /> },
  { path: 'proposals', element: <ProposalQueuePage /> },
  {
    path: 'admin',
    element: (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Loading…
          </div>
        }
      >
        <Outlet />
      </Suspense>
    ),
    children: aiAdminRoutes,
  },
];

/**
 * PRD-134 — top-level page for `/food/inbox`.
 *
 * Reads the `?tab=` query param + the URL hash, mounts the right tab body,
 * and pushes filter / tab updates back into the URL so refresh + shared
 * links keep the user in the same state.
 *
 * The Rejected + Failed tab content lands from PRD-138 (already on `main`).
 * This PRD owns the shell + the Drafts tab + the URL plumbing.
 */
import { type ReactElement, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useLocation, useNavigate } from 'react-router';

import { usePillarQuery } from '@pops/pillar-sdk/react';

import { decodeFiltersHash, encodeFiltersHash, type DraftsFiltersState } from './drafts-filters.js';
import { DraftsTab } from './DraftsTab.js';
import { FailedTab } from './FailedTab.js';
import { DEFAULT_INBOX_TAB, type InboxTabKey, parseTabKey } from './inbox-tabs.js';
import { InboxLayout } from './InboxLayout.js';
import { RejectedTab } from './RejectedTab.js';

import type { inferRouterOutputs } from '@trpc/server';
import type { NavigateFunction } from 'react-router';

import type { AppRouter } from '@pops/api';

type InboxPendingCountOutput = inferRouterOutputs<AppRouter>['food']['inbox']['pendingCount'];

interface Props {
  /** Override "now" so tests can pin relative-time strings. */
  now?: Date;
}

export function InboxPage({ now }: Props = {}): ReactElement {
  const { t } = useTranslation('food');
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const rawTab = searchParams.get('tab');
  const activeTab = parseTabKey(rawTab);
  useEffect(() => {
    if (rawTab !== null && rawTab !== activeTab) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', activeTab);
      setSearchParams(next, { replace: true });
    }
  }, [rawTab, activeTab, searchParams, setSearchParams]);

  const filters = decodeFiltersHash(location.hash);
  const pendingCount = usePendingCount();
  const onTabChange = useTabChangeNavigator(searchParams, navigate, location.pathname);
  const onFiltersChange = useFiltersNavigator(navigate, location.pathname, location.search);

  return (
    <InboxLayout
      activeTab={activeTab}
      onTabChange={onTabChange}
      pendingCount={pendingCount}
      tabs={makeTabs(t)}
      t={t}
    >
      {activeTab === 'drafts' && (
        <DraftsTab filters={filters} onFiltersChange={onFiltersChange} now={now} />
      )}
      {activeTab === 'rejected' && <RejectedTab now={now} />}
      {activeTab === 'failed' && <FailedTab now={now} />}
    </InboxLayout>
  );
}

function usePendingCount(): number | null {
  const query = usePillarQuery<InboxPendingCountOutput>(
    'food',
    ['inbox', 'pendingCount'],
    undefined,
    {
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
    }
  );
  return query.data?.count ?? null;
}

function useTabChangeNavigator(
  searchParams: URLSearchParams,
  navigate: NavigateFunction,
  pathname: string
): (tab: InboxTabKey) => void {
  return useCallback(
    (tab: InboxTabKey) => {
      const next = new URLSearchParams(searchParams);
      if (tab === DEFAULT_INBOX_TAB) next.delete('tab');
      else next.set('tab', tab);
      void navigate(
        { pathname, search: next.toString() === '' ? '' : `?${next.toString()}` },
        { replace: false }
      );
    },
    [searchParams, navigate, pathname]
  );
}

function useFiltersNavigator(
  navigate: NavigateFunction,
  pathname: string,
  search: string
): (next: DraftsFiltersState) => void {
  return useCallback(
    (next: DraftsFiltersState) => {
      const hash = encodeFiltersHash(next);
      void navigate(
        { pathname, search, hash: hash.length === 0 ? '' : `#${hash}` },
        { replace: true }
      );
    },
    [navigate, pathname, search]
  );
}

function makeTabs(t: (key: string) => string): { key: InboxTabKey; label: string }[] {
  return [
    { key: 'drafts', label: t('inbox.tabs.drafts') },
    { key: 'rejected', label: t('inbox.tabs.rejected') },
    { key: 'failed', label: t('inbox.tabs.failed') },
  ];
}

/**
 * Tab strip + page header for `/food/inbox` (Drafts / Rejected / Failed).
 *
 * The sidebar pending-count badge is not rendered here: the navigation rail
 * is owned by the shell and has no badge surface, so that part is deferred
 * (see pillars/food/docs/prds/review-queue-page). The count itself comes
 * from the `inboxPendingCount` endpoint, surfaced as the header subtitle.
 */
import { type ReactElement, type ReactNode } from 'react';

import type { InboxTabKey } from './inbox-tabs.js';

interface Props {
  activeTab: InboxTabKey;
  onTabChange: (tab: InboxTabKey) => void;
  pendingCount: number | null;
  tabs: { key: InboxTabKey; label: string; badge?: number }[];
  children: ReactNode;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function InboxLayout({
  activeTab,
  onTabChange,
  pendingCount,
  tabs,
  children,
  t,
}: Props): ReactElement {
  return (
    <div className="space-y-4" data-testid="inbox-layout">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('inbox.title')}</h1>
        <p className="text-sm text-muted-foreground" data-testid="inbox-pending-count">
          {pendingCount === null
            ? t('inbox.pendingCount.loading')
            : t('inbox.pendingCount.count', { count: pendingCount })}
        </p>
      </header>
      <nav className="flex gap-2 border-b" role="tablist" aria-label={t('inbox.title')}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              // Single tabpanel that swaps content per tab; every tab points
              // at the same stable id so screen readers don't break on the
              // inactive tabs referencing a non-existent element.
              aria-controls="inbox-panel"
              onClick={() => onTabChange(tab.key)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`inbox-tab-${tab.key}`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div role="tabpanel" id="inbox-panel">
        {children}
      </div>
    </div>
  );
}

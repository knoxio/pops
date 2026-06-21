/**
 * QueryHistorySidebar — re-runnable list of past queries (PRD-082).
 *
 * History lives in `localStorage`; see `query/history-storage.ts`. The
 * sidebar shows the most recent queries first with a one-click re-run.
 */
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { formatTimestamp } from '../../utils/format';
import { TOUCH_TARGET_MIN_HEIGHT } from '../../utils/touchTarget';

import type { QueryHistoryEntry } from '../../query/types';

interface QueryHistorySidebarProps {
  history: QueryHistoryEntry[];
  activeId: string | null;
  onRerun: (entry: QueryHistoryEntry) => void;
  onRemove: (id: string) => void;
}

function HistoryRow({
  entry,
  active,
  onRerun,
  onRemove,
}: {
  entry: QueryHistoryEntry;
  active: boolean;
  onRerun: (entry: QueryHistoryEntry) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation('cerebrum');
  return (
    <li
      data-testid="query-history-entry"
      data-active={active}
      className={`flex flex-col gap-1 rounded-md border p-2 text-sm ${
        active ? 'border-app-accent bg-app-accent/5' : 'border-border bg-card'
      }`}
    >
      <button
        type="button"
        className={`flex flex-col items-start gap-0.5 text-left ${TOUCH_TARGET_MIN_HEIGHT}`}
        onClick={() => onRerun(entry)}
        data-testid="query-history-rerun"
        aria-label={t('query.history.rerunAria', { question: entry.question })}
      >
        <span className="line-clamp-2 text-sm font-medium">{entry.question}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {formatTimestamp(entry.submittedAt)}
        </span>
        {entry.lastConfidence ? (
          <span className="text-[10px] text-muted-foreground">
            {t(`query.confidence.${entry.lastConfidence}`)} ·{' '}
            {t('query.history.sourceCount', { count: entry.lastSourceCount })}
          </span>
        ) : null}
      </button>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onRemove(entry.id)}
          aria-label={t('query.history.removeAria', { question: entry.question })}
          data-testid="query-history-remove"
        >
          {t('query.history.remove')}
        </Button>
      </div>
    </li>
  );
}

export function QueryHistorySidebar({
  history,
  activeId,
  onRerun,
  onRemove,
}: QueryHistorySidebarProps) {
  const { t } = useTranslation('cerebrum');
  return (
    <aside
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
      data-testid="query-history"
    >
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">
        {t('query.history.title')}
      </h3>
      {history.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="query-history-empty">
          {t('query.history.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {history.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              active={entry.id === activeId}
              onRerun={onRerun}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}

import { Link } from 'react-router';

import { Badge, formatRelativeTime } from '@pops/ui';

import { ListKindChip } from './ListKindChip.js';

import type { ReactElement } from 'react';

import type { ListIndexItemView } from './useListsIndexQuery.js';

interface Props {
  item: ListIndexItemView;
  /** Translation function — passed in so the row stays locale-agnostic. */
  t: (key: string, opts?: Record<string, unknown>) => string;
}

/**
 * Row card for the `/lists` index. The whole row is the link target:
 * clicking anywhere navigates to `/lists/:id`.
 */
export function ListRow({ item, t }: Props): ReactElement {
  const archived = item.archivedAt !== null;
  return (
    <Link
      to={`/lists/${item.id}`}
      aria-label={item.name}
      className="block overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent/40"
    >
      <article className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold leading-tight">{item.name}</h3>
            <ListKindChip kind={item.kind} />
            {archived && <Badge variant="destructive">{t('index.card.archived')}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('index.card.itemCount', { count: item.itemCount })}
            {' · '}
            {t('index.card.updated', {
              when: formatRelativeTime(item.lastUpdatedAt),
            })}
          </p>
        </div>
        {!archived && item.uncheckedCount > 0 && (
          <Badge variant="secondary" aria-label={t('index.card.uncheckedAria')}>
            {t('index.card.uncheckedBadge', { count: item.uncheckedCount })}
          </Badge>
        )}
      </article>
    </Link>
  );
}

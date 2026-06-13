/**
 * PRD-151 — read-only Tags vocabulary tab at `/food/data/tags`.
 *
 * Groups every distinct tag in the database by namespace (`store-section`,
 * `diet`, `allergen`, …) and tags without a `:` segment under
 * `(no namespace)`. Each row links into the drill-down panel which lists
 * the ingredients carrying the tag — useful for spotting drift
 * (`store-section:produce` vs `store-section:Produce`) before PRD-152's
 * generator surfaces the duplicate.
 *
 * v1 is read-only. Rename / merge / bulk operations are deferred to a
 * future PRD that introduces multi-select on the Ingredients tab too.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePillarQuery } from '@pops/pillar-sdk/react';
import { Button } from '@pops/ui';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';
import type { TagDistinctRow } from '@pops/app-food-db';

type TagsDistinctOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['tags']['distinct'];
type TagsFindByTagOutput =
  inferRouterOutputs<AppRouter>['food']['ingredients']['tags']['findByTag'];

const NO_NAMESPACE = '__none__';

function splitNamespace(tag: string): { namespace: string; rest: string } {
  const colon = tag.indexOf(':');
  if (colon === -1) return { namespace: NO_NAMESPACE, rest: tag };
  return { namespace: tag.slice(0, colon), rest: tag.slice(colon + 1) };
}

function groupByNamespace(tags: readonly TagDistinctRow[]): Map<string, TagDistinctRow[]> {
  const out = new Map<string, TagDistinctRow[]>();
  for (const row of tags) {
    const { namespace } = splitNamespace(row.tag);
    const bucket = out.get(namespace);
    if (bucket === undefined) {
      out.set(namespace, [row]);
    } else {
      bucket.push(row);
    }
  }
  for (const bucket of out.values()) {
    bucket.sort((a, b) => a.tag.localeCompare(b.tag));
  }
  return out;
}

function formatTimestamp(value: string): string {
  if (value === '') return '—';
  // SQLite emits `YYYY-MM-DD HH:MM:SS` — keep the date for the vocabulary view;
  // the wall-clock precision isn't useful for spotting drift.
  return value.slice(0, 10);
}

export function TagsTab() {
  const { t } = useTranslation('food');
  const distinctQuery = usePillarQuery<TagsDistinctOutput>(
    'food',
    ['ingredients', 'tags', 'distinct'],
    { limit: 500 }
  );
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  if (distinctQuery.isLoading) {
    return <p className="text-muted-foreground p-4">{t('data.ingredients.loading')}</p>;
  }
  const tags = distinctQuery.data?.tags ?? [];
  if (tags.length === 0) {
    return (
      <p className="text-muted-foreground p-4" data-testid="tags-empty">
        {t('data.tags.empty')}
      </p>
    );
  }
  const grouped = groupByNamespace(tags);
  const orderedNamespaces = Array.from(grouped.keys()).toSorted((a, b) => {
    if (a === NO_NAMESPACE) return 1;
    if (b === NO_NAMESPACE) return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section aria-label={t('data.tags.heading')} className="space-y-6">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold">{t('data.tags.heading')}</h2>
          <p className="text-muted-foreground text-sm">{t('data.tags.description')}</p>
        </header>
        {orderedNamespaces.map((namespace) => (
          <NamespaceSection
            key={namespace}
            namespace={namespace}
            tags={grouped.get(namespace) ?? []}
            selectedTag={selectedTag}
            onSelect={setSelectedTag}
          />
        ))}
      </section>
      <TagDetailsPanel selectedTag={selectedTag} onClose={() => setSelectedTag(null)} />
    </div>
  );
}

function NamespaceSection({
  namespace,
  tags,
  selectedTag,
  onSelect,
}: {
  namespace: string;
  tags: TagDistinctRow[];
  selectedTag: string | null;
  onSelect: (tag: string) => void;
}) {
  const { t } = useTranslation('food');
  const heading = namespace === NO_NAMESPACE ? t('data.tags.noNamespace') : namespace;
  return (
    <section aria-label={heading} className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide">{heading}</h3>
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-xs uppercase tracking-wide">
          <tr>
            <th scope="col" className="py-1 text-left font-medium">
              {t('data.tags.table.tag')}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {t('data.tags.table.count')}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {t('data.tags.table.firstSeen')}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              <span className="sr-only">{t('data.tags.table.actionsAriaLabel')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tags.map((row) => (
            <tr
              key={row.tag}
              data-active={selectedTag === row.tag}
              className="border-border border-t data-[active=true]:bg-muted"
            >
              <td className="py-1 font-mono text-xs">{row.tag}</td>
              <td className="py-1 text-right">{row.ingredientCount}</td>
              <td className="text-muted-foreground py-1 text-right text-xs">
                {formatTimestamp(row.firstSeenAt)}
              </td>
              <td className="py-1 text-right">
                <Button size="sm" variant="ghost" onClick={() => onSelect(row.tag)}>
                  {t('data.tags.table.view')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TagDetailsPanel({
  selectedTag,
  onClose,
}: {
  selectedTag: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('food');
  const enabled = selectedTag !== null;
  const findQuery = usePillarQuery<TagsFindByTagOutput>(
    'food',
    ['ingredients', 'tags', 'findByTag'],
    { tag: selectedTag ?? '' },
    { enabled }
  );
  if (selectedTag === null) {
    return (
      <aside aria-label={t('data.tags.detail.ariaLabel')} className="text-muted-foreground text-sm">
        {t('data.tags.detail.prompt')}
      </aside>
    );
  }
  const ingredients = findQuery.data?.ingredients ?? [];
  return (
    <aside aria-label={t('data.tags.detail.ariaLabel')} className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="font-mono text-sm">{selectedTag}</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t('data.tags.detail.close')}
        </Button>
      </header>
      <TagDetailsBody isLoading={findQuery.isLoading} ingredients={ingredients} />
    </aside>
  );
}

function TagDetailsBody({
  isLoading,
  ingredients,
}: {
  isLoading: boolean;
  ingredients: readonly { id: number; slug: string; name: string }[];
}) {
  const { t } = useTranslation('food');
  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t('data.ingredients.loading')}</p>;
  }
  if (ingredients.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('data.tags.detail.empty')}</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {ingredients.map((ing) => (
        <li key={ing.id} className="flex items-baseline justify-between gap-2">
          <span>{ing.name}</span>
          <span className="text-muted-foreground font-mono text-xs">{ing.slug}</span>
        </li>
      ))}
    </ul>
  );
}

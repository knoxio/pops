import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { Label, TextInput, useDebouncedValue } from '@pops/ui';

import { unwrap } from '../../food-api-helpers.js';
import { slugsSearch } from '../../food-api/index.js';

import type { SlugsSearchResponses } from '../../food-api/types.gen.js';

type SlugSearchOutput = SlugsSearchResponses[200];

interface SearchItem {
  slug: string;
  kind: 'ingredient' | 'recipe' | 'prep_state';
  targetId: number;
  name: string;
}

function badgeKeyForKind(kind: SearchItem['kind']): string {
  if (kind === 'ingredient') return 'data.search.badge.ingredient';
  if (kind === 'prep_state') return 'data.search.badge.prepState';
  return 'data.search.badge.recipe';
}

function tabFor(item: SearchItem): { tab: string; navigable: boolean } {
  if (item.kind === 'ingredient') return { tab: 'ingredients', navigable: true };
  if (item.kind === 'prep_state') return { tab: 'prep-states', navigable: true };
  return { tab: 'recipes', navigable: false };
}

function SearchResultRow({
  item,
  onPick,
}: {
  item: SearchItem;
  onPick: (item: SearchItem) => void;
}) {
  const { t } = useTranslation('food');
  const { navigable } = tabFor(item);
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={false}
        disabled={!navigable}
        className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => onPick(item)}
      >
        <span>
          <span className="font-medium">{item.name || item.slug}</span>
          <span className="text-muted-foreground ml-2 text-xs">{item.slug}</span>
        </span>
        <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs">
          {t(badgeKeyForKind(item.kind))}
        </span>
      </button>
    </li>
  );
}

function SearchResults({
  listboxId,
  items,
  enabled,
  isLoading,
  onPick,
}: {
  listboxId: string;
  items: readonly SearchItem[];
  enabled: boolean;
  isLoading: boolean;
  onPick: (item: SearchItem) => void;
}) {
  const { t } = useTranslation('food');
  if (!enabled) return null;
  if (items.length === 0 && !isLoading) {
    return <p className="text-muted-foreground text-xs">{t('data.search.empty')}</p>;
  }
  if (items.length === 0) return null;
  return (
    <ul
      id={listboxId}
      role="listbox"
      aria-label={t('data.search.listAria')}
      className="border-border bg-popover divide-border max-h-72 divide-y overflow-y-auto rounded-md border text-sm"
    >
      {items.map((item) => (
        <SearchResultRow key={`${item.kind}-${item.targetId}`} item={item} onPick={onPick} />
      ))}
    </ul>
  );
}

export function GlobalSearchBar() {
  const { t } = useTranslation('food');
  const navigate = useNavigate();
  const inputId = useId();
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), 200);
  const enabled = debounced.length > 0;
  const searchInput = { query: debounced, limit: 8 };
  const searchQuery = useQuery({
    queryKey: ['food', 'slugs', 'search', searchInput],
    queryFn: async (): Promise<SlugSearchOutput> =>
      unwrap(await slugsSearch({ query: searchInput })),
    enabled,
  });
  const items = useMemo<readonly SearchItem[]>(
    () => (searchQuery.data?.items as readonly SearchItem[] | undefined) ?? [],
    [searchQuery.data]
  );

  function pick(item: SearchItem) {
    const { tab, navigable } = tabFor(item);
    if (!navigable) return;
    void navigate(`/food/data/${tab}?focus=${encodeURIComponent(item.slug)}`);
    setQuery('');
  }

  return (
    <div className="grid gap-1.5" data-testid="food-data-global-search">
      <Label htmlFor={inputId} className="sr-only">
        {t('data.search.label')}
      </Label>
      <TextInput
        id={inputId}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('data.search.placeholder')}
        aria-controls={enabled && items.length > 0 ? listboxId : undefined}
        aria-autocomplete="list"
      />
      <SearchResults
        listboxId={listboxId}
        items={items}
        enabled={enabled}
        isLoading={searchQuery.isLoading}
        onPick={pick}
      />
    </div>
  );
}

import { useTranslation } from 'react-i18next';

import { TextInput } from '@pops/ui';

export interface SlugSearchItem {
  slug: string;
  kind: 'ingredient' | 'recipe' | 'prep_state';
  targetId: number;
  name: string;
}

export function IngredientSearch({
  inputId,
  query,
  setQuery,
  matches,
  onPick,
  loading,
}: {
  inputId: string;
  query: string;
  setQuery: (s: string) => void;
  matches: readonly SlugSearchItem[];
  onPick: (item: SlugSearchItem) => void;
  loading: boolean;
}) {
  const { t } = useTranslation('food');
  const trimmed = query.trim();
  const showMatches = trimmed.length > 0 && matches.length > 0;
  const showEmpty = trimmed.length > 0 && !loading && matches.length === 0;
  return (
    <>
      <TextInput
        id={inputId}
        value={query}
        placeholder={t('data.substitutions.endpoint.searchPlaceholder')}
        onChange={(e) => setQuery(e.target.value)}
        aria-autocomplete="list"
      />
      {showMatches ? (
        <ul
          role="listbox"
          aria-label={t('data.substitutions.endpoint.suggestionsAria')}
          className="border-border bg-popover divide-border max-h-48 divide-y overflow-y-auto rounded-md border text-sm"
        >
          {matches.map((item) => (
            <li key={`${item.kind}-${item.targetId}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="hover:bg-accent w-full px-3 py-1.5 text-left"
                onClick={() => onPick(item)}
              >
                <span className="font-medium">{item.name || item.slug}</span>
                <span className="text-muted-foreground ml-2 text-xs">{item.slug}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showEmpty ? (
        <p className="text-muted-foreground text-xs">
          {t('data.substitutions.endpoint.noMatches')}
        </p>
      ) : null}
    </>
  );
}

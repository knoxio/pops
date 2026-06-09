import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
/**
 * Header controls for the PRD-148 substitution graph explorer.
 *
 * Scope toggle / context dropdown are controlled by URL state; the
 * search input owns local state and debounces its URL-sync by 200ms
 * (per PRD-148 spec) so per-keystroke typing doesn't churn the
 * tRPC query or the browser history. Deep links land with the URL's
 * `q` value pre-populated.
 */
import { Link } from 'react-router';

import { useDebouncedValue } from '@pops/ui';

import type { SubGraphScope } from './types';

export interface SubGraphHeaderProps {
  scope: SubGraphScope;
  onScopeChange: (scope: SubGraphScope) => void;
  contextTag: string | null;
  onContextTagChange: (tag: string | null) => void;
  availableContextTags: readonly string[];
  search: string;
  onSearchChange: (search: string) => void;
  onRefresh: () => void;
  tableHref: string;
}

export function SubGraphHeader(props: SubGraphHeaderProps): React.ReactElement {
  return (
    <header className="space-y-3">
      <TitleRow onRefresh={props.onRefresh} tableHref={props.tableHref} />
      <FilterRow
        scope={props.scope}
        onScopeChange={props.onScopeChange}
        contextTag={props.contextTag}
        onContextTagChange={props.onContextTagChange}
        availableContextTags={props.availableContextTags}
        search={props.search}
        onSearchChange={props.onSearchChange}
      />
    </header>
  );
}

function TitleRow({
  onRefresh,
  tableHref,
}: {
  onRefresh: () => void;
  tableHref: string;
}): React.ReactElement {
  const { t } = useTranslation('food');
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-2xl font-semibold tracking-tight">
        {t('data.substitutions.graph.title')}
      </h2>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="text-foreground hover:bg-muted inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
        >
          {t('data.substitutions.graph.refresh')}
        </button>
        <Link
          to={tableHref}
          className="text-foreground hover:bg-muted inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
        >
          {t('data.substitutions.graph.viewAsTable')}
        </Link>
      </div>
    </div>
  );
}

interface FilterRowProps {
  scope: SubGraphScope;
  onScopeChange: (scope: SubGraphScope) => void;
  contextTag: string | null;
  onContextTagChange: (tag: string | null) => void;
  availableContextTags: readonly string[];
  search: string;
  onSearchChange: (search: string) => void;
}

function FilterRow(props: FilterRowProps): React.ReactElement {
  const { t } = useTranslation('food');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <fieldset className="flex items-center gap-2">
        <legend className="sr-only">{t('data.substitutions.graph.scopeLabel')}</legend>
        <ScopeRadio scope="global" current={props.scope} onChange={props.onScopeChange} />
        <ScopeRadio scope="recipe" current={props.scope} onChange={props.onScopeChange} />
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('data.substitutions.graph.contextLabel')}</span>
        <select
          aria-label={t('data.substitutions.graph.contextLabel')}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          value={props.contextTag ?? ''}
          onChange={(e) => props.onContextTagChange(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{t('data.substitutions.graph.contextAll')}</option>
          {props.availableContextTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </label>
      <DebouncedSearchInput value={props.search} onChange={props.onSearchChange} />
    </div>
  );
}

const SEARCH_DEBOUNCE_MS = 200;

function DebouncedSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (search: string) => void;
}): React.ReactElement {
  const { t } = useTranslation('food');
  const [local, setLocal] = useState(value);
  // `userTyping` distinguishes a `local` change driven by user keystrokes
  // (which we want to debounce-emit) from a `local` change pushed in by
  // the parent (deep link, Clear-filters reset, browser back). Without
  // this flag, an externally-cleared URL would still receive a stale
  // debounce fire that re-pushes the previously-typed value.
  const userTyping = useRef(false);
  // Re-sync local from the URL-driven prop whenever it changes. The
  // setLocal + ref reset together ensure a stale debounce can't echo
  // a pre-clear value back into the URL. React bails on setLocal when
  // the value already matches, so an echo from our own debounce-emit
  // (parent processes onChange → re-emits same prop) is a no-op.
  useEffect(() => {
    userTyping.current = false;
    setLocal(value);
  }, [value]);
  const debounced = useDebouncedValue(local, SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    if (userTyping.current && debounced !== value) {
      userTyping.current = false;
      onChange(debounced);
    }
  }, [debounced, value, onChange]);
  return (
    <input
      type="search"
      value={local}
      onChange={(e) => {
        userTyping.current = true;
        setLocal(e.target.value);
      }}
      placeholder={t('data.substitutions.graph.searchPlaceholder')}
      className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
    />
  );
}

function ScopeRadio({
  scope,
  current,
  onChange,
}: {
  scope: SubGraphScope;
  current: SubGraphScope;
  onChange: (scope: SubGraphScope) => void;
}): React.ReactElement {
  const { t } = useTranslation('food');
  const labelKey =
    scope === 'global'
      ? 'data.substitutions.graph.scopeGlobal'
      : 'data.substitutions.graph.scopeRecipe';
  return (
    <label className="flex items-center gap-1 text-sm">
      <input
        type="radio"
        name="sub-graph-scope"
        value={scope}
        checked={current === scope}
        onChange={() => onChange(scope)}
      />
      {t(labelKey)}
    </label>
  );
}

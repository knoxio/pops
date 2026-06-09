/**
 * Aliases tab toolbar (PRD-122-C).
 *
 * Holds the source filter chips + the search box + the action buttons
 * (Add, Bulk approve LLM, Merge). Action buttons enable based on the
 * current selection state; the Bulk approve LLM button only enables when
 * at least one llm-sourced alias is selected.
 */
import { useTranslation } from 'react-i18next';

import { Button, Input } from '@pops/ui';

import type { AliasesFilter, AliasSource } from './types';

export interface AliasesToolbarProps {
  readonly filter: AliasesFilter;
  readonly onFilterChange: (next: AliasesFilter) => void;
  readonly selectedCount: number;
  readonly hasLlmSelection: boolean;
  readonly onAddClick: () => void;
  readonly onMergeClick: () => void;
  readonly onBulkApproveClick: () => void;
}

export function AliasesToolbar(props: AliasesToolbarProps) {
  const { t } = useTranslation('food');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SourceFilterChips filter={props.filter} onFilterChange={props.onFilterChange} />
      <Input
        type="search"
        value={props.filter.search}
        onChange={(e) => props.onFilterChange({ ...props.filter, search: e.target.value })}
        placeholder={t('data.aliases.toolbar.searchPlaceholder')}
        aria-label={t('data.aliases.toolbar.searchAria')}
        className="max-w-xs"
      />
      <ToolbarActions
        selectedCount={props.selectedCount}
        hasLlmSelection={props.hasLlmSelection}
        onAddClick={props.onAddClick}
        onMergeClick={props.onMergeClick}
        onBulkApproveClick={props.onBulkApproveClick}
      />
    </div>
  );
}

interface SourceFilterChipsProps {
  readonly filter: AliasesToolbarProps['filter'];
  readonly onFilterChange: AliasesToolbarProps['onFilterChange'];
}

function SourceFilterChips({ filter, onFilterChange }: SourceFilterChipsProps) {
  const { t } = useTranslation('food');
  const sources: readonly (AliasSource | 'all')[] = ['all', 'user', 'llm', 'ingest'];
  return (
    <div role="group" aria-label={t('data.aliases.toolbar.sourceFilterAria')}>
      {sources.map((s) => {
        const isActive = s === 'all' ? filter.source === null : filter.source === s;
        const cls = isActive
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground';
        return (
          <button
            key={s}
            type="button"
            aria-pressed={isActive}
            onClick={() => onFilterChange({ ...filter, source: s === 'all' ? null : s })}
            className={`${cls} mr-2 rounded-full px-3 py-1 text-xs`}
          >
            {t(`data.aliases.source.${s}`)}
          </button>
        );
      })}
    </div>
  );
}

interface ToolbarActionsProps {
  readonly selectedCount: number;
  readonly hasLlmSelection: boolean;
  readonly onAddClick: () => void;
  readonly onMergeClick: () => void;
  readonly onBulkApproveClick: () => void;
}

function ToolbarActions(p: ToolbarActionsProps) {
  const { t } = useTranslation('food');
  return (
    <div className="ml-auto flex items-center gap-2">
      <Button onClick={p.onAddClick} size="sm">
        {t('data.aliases.toolbar.add')}
      </Button>
      <Button variant="secondary" size="sm" onClick={p.onMergeClick} disabled={p.selectedCount < 2}>
        {t('data.aliases.toolbar.merge', { count: p.selectedCount })}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={p.onBulkApproveClick}
        disabled={!p.hasLlmSelection}
      >
        {t('data.aliases.toolbar.bulkApprove')}
      </Button>
    </div>
  );
}

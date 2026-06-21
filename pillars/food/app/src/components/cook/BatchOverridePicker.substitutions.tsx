/**
 * PRD-149 — Substitutions section of `BatchOverridePicker`.
 *
 * Cross-product candidate × batch rendering with a 5-item display cap
 * + "Show all" expander. Loading / error / empty states sit alongside
 * the row list so the parent picker stays declarative.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { SubstitutionCandidateRow } from './SubstitutionCandidateRow.js';

import type { ReactNode } from 'react';

import type { SubCandidate, SubCandidateBatch } from './useSubstitutionResolution.js';

const SUB_INITIAL_CAP = 5;

export interface SubstitutionsSectionProps {
  candidates: readonly SubCandidate[];
  linePrepStateId: number | null;
  isLoading: boolean;
  isError: boolean;
  onSelect: (selection: { candidate: SubCandidate; batch: SubCandidateBatch }) => void;
}

interface CandidateRow {
  candidate: SubCandidate;
  batch: SubCandidateBatch | null;
}

export function SubstitutionsSection(props: SubstitutionsSectionProps): ReactNode {
  const { t } = useTranslation('food');
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => flattenCandidateRows(props.candidates), [props.candidates]);
  const visible = expanded ? rows : rows.slice(0, SUB_INITIAL_CAP);
  return (
    <section data-testid="picker-section-substitutions">
      <h5 className="text-xs font-semibold uppercase text-muted-foreground sticky top-0 bg-card py-1">
        {t('cook.subPicker.section.title', { count: rows.length })}
      </h5>
      <SubBody
        loading={props.isLoading}
        error={props.isError}
        rows={rows}
        visible={visible}
        expanded={expanded}
        linePrepStateId={props.linePrepStateId}
        onExpand={() => setExpanded(true)}
        onSelect={props.onSelect}
      />
    </section>
  );
}

interface SubBodyProps {
  loading: boolean;
  error: boolean;
  rows: readonly CandidateRow[];
  visible: readonly CandidateRow[];
  expanded: boolean;
  linePrepStateId: number | null;
  onExpand: () => void;
  onSelect: SubstitutionsSectionProps['onSelect'];
}

function SubBody(props: SubBodyProps): ReactNode {
  const { t } = useTranslation('food');
  if (props.loading) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="sub-picker-loading">
        {t('cook.subPicker.loading')}
      </p>
    );
  }
  if (props.error) {
    return (
      <p className="text-sm text-destructive" role="alert" data-testid="sub-picker-error">
        {t('cook.subPicker.error')}
      </p>
    );
  }
  if (props.rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="sub-picker-empty">
        {t('cook.subPicker.empty')}
      </p>
    );
  }
  return (
    <>
      <ul className="border rounded divide-y max-h-60 overflow-y-auto">
        {props.visible.map((row, i) => (
          <li key={`${row.candidate.substitutionId}-${row.batch?.batchId ?? `empty-${i}`}`}>
            <SubstitutionCandidateRow
              candidate={row.candidate}
              batch={row.batch}
              linePrepStateId={props.linePrepStateId}
              onSelect={props.onSelect}
            />
          </li>
        ))}
      </ul>
      {!props.expanded && props.rows.length > SUB_INITIAL_CAP ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={props.onExpand}
          data-testid="sub-picker-show-all"
        >
          {t('cook.subPicker.showAll', { count: props.rows.length })}
        </Button>
      ) : null}
    </>
  );
}

function flattenCandidateRows(candidates: readonly SubCandidate[]): CandidateRow[] {
  const rows: CandidateRow[] = [];
  for (const candidate of candidates) {
    if (candidate.batches.length === 0) {
      rows.push({ candidate, batch: null });
      continue;
    }
    for (const batch of candidate.batches) {
      rows.push({ candidate, batch });
    }
  }
  return rows;
}

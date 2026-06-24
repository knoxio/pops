/**
 * `ConsumePreviewPanel` — embeds inside `CookModal` between the field
 * grid and the action buttons. Lists every line whose resolution has a
 * deterministic disposition (FIFO, batch-override, partial, or external)
 * so the user can confirm what will be touched at submit time.
 *
 * Auto-collapses in the happy path (no shortfalls); defaults to
 * expanded when any shortfall exists.
 */
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatQty, formatUnit } from './cook-format.js';

import type { ReactNode } from 'react';

import type { LineConsumeNeed, LineResolution } from './cook-resolution-types.js';

const COLLAPSED_LIMIT = 5;

export interface ConsumePreviewPanelProps {
  lineNeeds: readonly LineConsumeNeed[];
  resolutionMap: ReadonlyMap<number, LineResolution>;
  hasShortfalls: boolean;
}

interface ResolvedLine {
  need: LineConsumeNeed;
  resolution: LineResolution;
}

function collectResolvedLines(
  lineNeeds: readonly LineConsumeNeed[],
  resolutionMap: ReadonlyMap<number, LineResolution>
): ResolvedLine[] {
  const resolved: ResolvedLine[] = [];
  for (const need of lineNeeds) {
    if (need.optional) continue;
    const resolution = resolutionMap.get(need.lineIndex);
    if (resolution === undefined) continue;
    resolved.push({ need, resolution });
  }
  return resolved;
}

function batchesTouched(resolved: readonly ResolvedLine[]): number {
  const ids = new Set<number>();
  for (const { resolution } of resolved) {
    if (resolution.kind === 'batch-override' || resolution.kind === 'partial') {
      ids.add(resolution.batchId);
    }
  }
  return ids.size;
}

export function ConsumePreviewPanel(props: ConsumePreviewPanelProps): ReactNode {
  const { lineNeeds, resolutionMap, hasShortfalls } = props;
  const { t } = useTranslation('food');
  const headingId = useId();
  const [expanded, setExpanded] = useState<boolean>(hasShortfalls);

  const resolved = useMemo(
    () => collectResolvedLines(lineNeeds, resolutionMap),
    [lineNeeds, resolutionMap]
  );
  const batches = useMemo(() => batchesTouched(resolved), [resolved]);

  if (resolved.length === 0) {
    return (
      <section aria-labelledby={headingId} className="border border-dashed rounded-md p-3">
        <h3 id={headingId} className="text-sm font-medium">
          {t('cook.consumePreview.title')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('cook.consumePreview.empty')}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} className="border rounded-md">
      <PanelHeader
        headingId={headingId}
        expanded={expanded}
        onToggle={() => setExpanded((p) => !p)}
        lineCount={resolved.length}
        batchCount={batches}
      />
      {expanded ? <ResolvedLineList resolved={resolved} /> : null}
    </section>
  );
}

interface PanelHeaderProps {
  headingId: string;
  expanded: boolean;
  onToggle: () => void;
  lineCount: number;
  batchCount: number;
}

function PanelHeader(props: PanelHeaderProps): ReactNode {
  const { t } = useTranslation('food');
  return (
    <button
      type="button"
      aria-expanded={props.expanded}
      onClick={props.onToggle}
      className="flex w-full items-center justify-between p-3 text-left"
    >
      <h3 id={props.headingId} className="text-sm font-medium">
        {t('cook.consumePreview.title')}
      </h3>
      <span className="text-xs text-muted-foreground">
        {t('cook.consumePreview.summary', {
          lines: props.lineCount,
          batches: props.batchCount,
        })}
      </span>
    </button>
  );
}

interface ResolvedLineListProps {
  resolved: readonly ResolvedLine[];
}

function ResolvedLineList(props: ResolvedLineListProps): ReactNode {
  const { t } = useTranslation('food');
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? props.resolved : props.resolved.slice(0, COLLAPSED_LIMIT);
  const hidden = props.resolved.length - visible.length;
  return (
    <ul className="border-t divide-y" data-testid="consume-preview-list">
      {visible.map(({ need, resolution }) => (
        <li key={need.lineIndex} className="flex justify-between gap-3 p-2 text-sm">
          <span className="font-medium">
            {need.ingredientName}
            {need.variantName === '' ? '' : ` · ${need.variantName}`}
          </span>
          <span className="text-muted-foreground text-right">
            {describeResolution(t, need, resolution)}
          </span>
        </li>
      ))}
      {hidden > 0 && !showAll ? (
        <li className="p-2 text-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-xs text-primary hover:underline"
          >
            {t('cook.consumePreview.showMore', { count: hidden })}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

function describeResolution(
  t: ReturnType<typeof useTranslation>['t'],
  need: LineConsumeNeed,
  resolution: LineResolution
): string {
  const unit = formatUnit(need.canonicalUnit);
  switch (resolution.kind) {
    case 'fifo':
      return t('cook.consumePreview.line.fifo', { qty: formatQty(need.qty), unit });
    case 'batch-override':
      return t('cook.consumePreview.line.batchOverride', {
        qty: formatQty(resolution.consumeQty),
        unit,
        batchId: resolution.batchId,
      });
    case 'external':
      return t('cook.consumePreview.line.external');
    case 'partial':
      return t('cook.consumePreview.line.partial', {
        batchQty: formatQty(resolution.consumeQty),
        externalQty: formatQty(resolution.externalQty),
        unit,
        batchId: resolution.batchId,
      });
  }
}

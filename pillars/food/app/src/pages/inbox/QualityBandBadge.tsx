/**
 * Colour-coded pill showing a draft's quality band. Hover surfaces the top
 * signals from `scoreDraft` so triagers see why a draft landed in a band
 * without opening the inspector. The tooltip is a native `title` attribute,
 * not a Radix Tooltip — a portal is disproportionate to a transient hover hint.
 */
import { type ReactElement } from 'react';

import type { QualityBand } from '../../food-api-shared-types.js';
import type { InboxListResponses } from '../../food-api/types.gen.js';

type QualitySignal = InboxListResponses[200]['items'][number]['topSignals'][number];

interface Props {
  band: QualityBand;
  topSignals: readonly QualitySignal[];
  bandLabel: string;
}

const BAND_CLASS: Record<QualityBand, string> = {
  clean: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  minor: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  attention: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  blocked: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
};

export function QualityBandBadge({ band, topSignals, bandLabel }: Props): ReactElement {
  const tooltip = topSignals.length === 0 ? bandLabel : topSignals.map((s) => s.code).join('\n');
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${BAND_CLASS[band]}`}
      title={tooltip}
      data-testid="quality-band-badge"
      data-band={band}
    >
      {bandLabel}
    </span>
  );
}

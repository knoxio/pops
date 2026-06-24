/**
 * Renders the band pill, the integer score, and the full signal list —
 * NOT truncated to top-3 like the inbox row tooltip.
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { QualityBandBadge } from '../QualityBandBadge.js';

import type { QualityResult } from './inspector-wire-types.js';

interface Props {
  quality: QualityResult;
}

export function QualityBandCard({ quality }: Props): ReactElement {
  const { t } = useTranslation('food');
  const bandLabel = t(`inbox.drafts.row.band.${quality.band}`, {
    defaultValue: quality.band,
  });
  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="inspector-quality-card">
      <div className="flex items-center gap-3">
        <QualityBandBadge
          band={quality.band}
          topSignals={quality.signals.slice(0, 3)}
          bandLabel={bandLabel}
        />
        <span className="text-2xl font-semibold" data-testid="inspector-quality-score">
          {quality.score}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('inbox.inspector.decision.scoreSuffix')}
        </span>
      </div>
      <ul className="space-y-1" data-testid="inspector-quality-signals">
        {quality.signals.map((signal) => (
          <li key={signal.code} className="flex items-center justify-between gap-2 text-sm">
            <span>{t(`inbox.qualitySignal.${signal.code}`, { defaultValue: signal.code })}</span>
            <span
              className={`tabular-nums ${signal.weight < 0 ? 'text-destructive' : 'text-emerald-600'}`}
            >
              {signal.weight > 0 ? '+' : ''}
              {signal.weight}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

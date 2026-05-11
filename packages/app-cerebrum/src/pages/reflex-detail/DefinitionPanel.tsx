/**
 * Definition panel — read-only summary of the reflex TOML record.
 */
import { useTranslation } from 'react-i18next';

import { summariseAction, summariseTrigger } from '../../reflex/triggerSummary';
import { formatTimestamp } from '../../utils/format';

import type { ReflexWithStatus } from '../../reflex/types';

export function DefinitionPanel({ reflex }: { reflex: ReflexWithStatus }) {
  const { t } = useTranslation('cerebrum');
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">
        {t('reflex.detail.definition')}
      </h3>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">{t('reflex.detail.description')}</dt>
        <dd>{reflex.description || '—'}</dd>
        <dt className="text-muted-foreground">{t('reflex.detail.trigger')}</dt>
        <dd>{summariseTrigger(reflex.trigger, t)}</dd>
        <dt className="text-muted-foreground">{t('reflex.detail.action')}</dt>
        <dd>{summariseAction(reflex.action, t)}</dd>
        <dt className="text-muted-foreground">{t('reflex.detail.nextFire')}</dt>
        <dd>{formatTimestamp(reflex.nextFireTime)}</dd>
        <dt className="text-muted-foreground">{t('reflex.detail.executions')}</dt>
        <dd>{reflex.executionCount}</dd>
      </dl>
    </section>
  );
}

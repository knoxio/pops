import { cn } from '@pops/ui';

import type { FeatureStatus } from '@pops/types';

const PILL_BASE =
  'inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded-full border';

const STATE_CLASS: Record<FeatureStatus['state'], string> = {
  enabled: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
  disabled: 'bg-muted text-muted-foreground border-border',
  unavailable: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
};

const STATE_LABEL: Record<FeatureStatus['state'], string> = {
  enabled: 'Enabled',
  disabled: 'Disabled',
  unavailable: 'Unavailable',
};

export function FeatureStatePill({ state }: { state: FeatureStatus['state'] }) {
  return <span className={cn(PILL_BASE, STATE_CLASS[state])}>{STATE_LABEL[state]}</span>;
}

import { FileText, History, Lock, Radio, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AccountMark, Badge, Button, Card, cn } from '@pops/ui';

import { importStepLabel } from '../step-labels';
import {
  dayLabel,
  daysBetween,
  type PendingImportItem,
  sourceLabel,
  whenLabel,
} from './pending-import-view';

import type { TFunction } from 'i18next';

export interface PendingImportActions {
  onOpen: (draftId: string) => void;
  onTakeOver: (draftId: string) => void;
  onDiscard: (draftId: string) => void;
}

type Tone = 'secondary' | 'destructive' | 'default';

function badgeFor(state: PendingImportItem['draft']['state'], t: TFunction<'finance'>) {
  const badges: Record<typeof state, { label: string; tone: Tone }> = {
    saved: { label: t('import.pending.stateSaved'), tone: 'secondary' },
    live: { label: t('import.pending.stateLive'), tone: 'default' },
    open: { label: t('import.pending.stateOpen'), tone: 'secondary' },
    'left-open': { label: t('import.pending.stateLeftOpen'), tone: 'secondary' },
    unusable: { label: t('import.pending.stateUnusable'), tone: 'destructive' },
  };
  return badges[state];
}

function StateIcon({ draft }: { draft: PendingImportItem['draft'] }) {
  if (draft.state === 'unusable') return <TriangleAlert className="h-4 w-4 text-destructive" />;
  if (draft.state === 'open' || draft.state === 'left-open') {
    return <Lock className="h-4 w-4 text-muted-foreground" />;
  }
  if (draft.source.kind === 'live') return <Radio className="h-4 w-4 text-primary" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

/** The one line under the title: how far it got, or why it cannot go further. */
export function progressLine(
  draft: PendingImportItem['draft'],
  t: TFunction<'finance'>,
  now = new Date().toISOString()
): string {
  const step = importStepLabel(draft.step) ?? t('import.pending.theStart');
  const seen = draft.ownerSeenAt ?? draft.savedAt;
  switch (draft.state) {
    case 'unusable':
      return draft.unusableReason ?? t('import.pending.cannotResume');
    case 'open':
      return t('import.pending.openLine', { when: whenLabel(seen), step });
    case 'left-open':
      return t('import.pending.leftOpenLine', { count: daysBetween(seen, now), step });
    case 'live':
      return draft.unresolvedCount === 0
        ? t('import.pending.liveLineWaiting', {
            count: draft.rowCount,
            when: whenLabel(draft.savedAt),
          })
        : t('import.pending.liveLineNeed', {
            count: draft.rowCount,
            when: whenLabel(draft.savedAt),
            need: draft.unresolvedCount,
          });
    case 'saved':
      return draft.unresolvedCount === 0
        ? t('import.pending.savedLineDone', { count: draft.rowCount, step })
        : t('import.pending.savedLineLeft', {
            count: draft.rowCount,
            step,
            left: draft.unresolvedCount,
          });
  }
}

function PrimaryAction({
  draft,
  actions,
  t,
}: {
  draft: PendingImportItem['draft'];
  actions: PendingImportActions;
  t: TFunction<'finance'>;
}) {
  switch (draft.state) {
    case 'saved':
      return (
        <Button
          size="sm"
          prefix={<History className="h-4 w-4" />}
          onClick={() => actions.onOpen(draft.id)}
        >
          {t('import.pending.resume')}
        </Button>
      );
    case 'live':
      return (
        <Button size="sm" onClick={() => actions.onOpen(draft.id)}>
          {t('import.pending.review')}
        </Button>
      );
    case 'open':
      return (
        <Button size="sm" variant="outline" onClick={() => actions.onTakeOver(draft.id)}>
          {t('import.pending.takeOverHere')}
        </Button>
      );
    case 'left-open':
      return (
        <Button size="sm" onClick={() => actions.onTakeOver(draft.id)}>
          {t('import.pending.takeOver')}
        </Button>
      );
    case 'unusable':
      return (
        <Button size="sm" variant="destructive" onClick={() => actions.onDiscard(draft.id)}>
          {t('import.pending.discardAction')}
        </Button>
      );
  }
}

/**
 * One pending import, as every entry point shows it (POPS-3332): the
 * dashboard and the wizard's first step compose this card, so the two never
 * describe the same draft in different words. The state decides the one
 * action on offer, and the card says what the wizard will do before it is
 * clicked, because a draft is weeks of someone's decisions and "Resume"
 * alone does not say so.
 */
export function PendingImportCard({
  item,
  actions,
  compact = false,
}: {
  item: PendingImportItem;
  actions: PendingImportActions;
  compact?: boolean;
}) {
  const { t } = useTranslation('finance');
  const { draft, account } = item;
  const badge = badgeFor(draft.state, t);
  const label = sourceLabel(
    draft.source,
    (first, rest) => t('import.pending.filesMore', { first, count: rest }),
    (provider) => t('import.pending.liveFeed', { provider })
  );
  return (
    <Card
      data-testid="pending-import-card"
      data-state={draft.state}
      className={cn(compact ? 'p-3' : 'p-4', draft.state === 'unusable' && 'border-destructive/40')}
    >
      <div className="flex items-center gap-3">
        <AccountMark account={account} size={compact ? 'sm' : 'md'} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <StateIcon draft={draft} />
            <span className="truncate text-sm font-medium">
              {account.name} · {label}
            </span>
            <Badge variant={badge.tone} className="font-normal">
              {badge.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{progressLine(draft, t)}</p>
          {!compact && draft.span && draft.state !== 'unusable' && (
            <p className="text-xs text-muted-foreground">
              {t('import.pending.coversLine', {
                from: dayLabel(draft.span.from),
                to: dayLabel(draft.span.to),
                when: whenLabel(draft.savedAt),
              })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {draft.state === 'saved' && (
            <Button size="sm" variant="ghost" onClick={() => actions.onDiscard(draft.id)}>
              {t('import.pending.discardAction')}
            </Button>
          )}
          <PrimaryAction draft={draft} actions={actions} t={t} />
        </div>
      </div>
    </Card>
  );
}

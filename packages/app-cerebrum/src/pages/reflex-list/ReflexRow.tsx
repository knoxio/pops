/**
 * ReflexRow — a single row in the reflex list table. Owns its
 * trigger summary + status badge + toggle/fire controls. The page
 * component routes mutation callbacks down through props.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Badge, Button, Switch, TableCell, TableRow } from '@pops/ui';

import { summariseTrigger } from '../../reflex/triggerSummary';
import { formatTimestamp } from '../../utils/format';
import { TOUCH_TARGET_MIN_HEIGHT } from '../../utils/touchTarget';

import type { ReflexWithStatus } from '../../reflex/types';

function StatusBadge({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation('cerebrum');
  return enabled ? (
    <Badge variant="default">{t('reflex.status.enabled')}</Badge>
  ) : (
    <Badge variant="secondary">{t('reflex.status.disabled')}</Badge>
  );
}

export interface ReflexRowProps {
  reflex: ReflexWithStatus;
  onToggle: (name: string, next: boolean) => void;
  onTest: (name: string) => void;
  isPending: boolean;
}

export function ReflexRow({ reflex, onToggle, onTest, isPending }: ReflexRowProps) {
  const { t } = useTranslation('cerebrum');
  return (
    <TableRow data-testid="reflex-row">
      <TableCell className="font-medium">
        <Link
          to={`/cerebrum/reflex/${encodeURIComponent(reflex.name)}`}
          className="hover:underline"
        >
          {reflex.name}
        </Link>
        {reflex.description ? (
          <p className="text-xs text-muted-foreground">{reflex.description}</p>
        ) : null}
      </TableCell>
      <TableCell>
        <StatusBadge enabled={reflex.enabled} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {summariseTrigger(reflex.trigger, t)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatTimestamp(reflex.lastExecutionAt)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{reflex.executionCount}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2 justify-end">
          <Switch
            checked={reflex.enabled}
            disabled={isPending}
            aria-label={t('reflex.list.toggle', { name: reflex.name })}
            onCheckedChange={(next) => onToggle(reflex.name, next)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            className={TOUCH_TARGET_MIN_HEIGHT}
            onClick={() => onTest(reflex.name)}
          >
            {t('reflex.list.fire')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

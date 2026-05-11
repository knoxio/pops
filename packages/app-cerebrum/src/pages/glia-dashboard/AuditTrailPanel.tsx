/**
 * Glia audit trail panel — chronological view of every action with
 * filterable type/status. Backed by `cerebrum.glia.actions.list`.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { trpc } from '@pops/api-client';
import {
  Button,
  Skeleton,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TooltipProvider,
} from '@pops/ui';

import {
  GLIA_ACTION_STATUSES,
  GLIA_ACTION_TYPES,
  type GliaAction,
  type GliaActionStatus,
  type GliaActionType,
} from '../../glia/types';
import { extractMessage } from '../../utils/errors';
import { TOUCH_TARGET_MIN_HEIGHT } from '../../utils/touchTarget';
import { AuditActionRow } from './AuditActionRow';

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  emptyLabel,
}: {
  label: string;
  value: T | null;
  onChange: (next: T | null) => void;
  options: readonly T[];
  emptyLabel: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        aria-label={label}
        className={`rounded-md border border-border bg-background px-2 text-sm ${TOUCH_TARGET_MIN_HEIGHT}`}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value as T | '') === '' ? null : (e.target.value as T))}
      >
        <option value="">{emptyLabel}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

interface AuditBodyProps {
  query: {
    isLoading: boolean;
    error: { message: string } | null;
    refetch: () => Promise<unknown>;
  };
  actions: GliaAction[];
}

function AuditBody({ query, actions }: AuditBodyProps) {
  const { t } = useTranslation('cerebrum');
  if (query.isLoading) {
    return (
      <div data-testid="glia-audit-loading" className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (query.error) {
    return (
      <div className="p-6 text-center" data-testid="glia-audit-error">
        <p className="text-destructive mb-3">
          {t('glia.audit.error', { message: extractMessage(query.error, t('errors.unknown')) })}
        </p>
        <Button
          variant="outline"
          size="sm"
          className={TOUCH_TARGET_MIN_HEIGHT}
          onClick={() => void query.refetch()}
        >
          {t('glia.audit.retry')}
        </Button>
      </div>
    );
  }
  if (actions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="glia-audit-empty">
        {t('glia.audit.empty')}
      </p>
    );
  }
  return (
    <Table data-testid="glia-audit-table">
      <TableHeader>
        <TableRow>
          <TableHead>{t('glia.audit.column.created')}</TableHead>
          <TableHead>{t('glia.audit.column.type')}</TableHead>
          <TableHead>{t('glia.audit.column.status')}</TableHead>
          <TableHead>{t('glia.audit.column.phase')}</TableHead>
          <TableHead>{t('glia.audit.column.affected')}</TableHead>
          <TableHead>{t('glia.audit.column.rationale')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {actions.map((action) => (
          <AuditActionRow key={action.id} action={action} />
        ))}
      </TableBody>
    </Table>
  );
}

export function AuditTrailPanel() {
  const { t } = useTranslation('cerebrum');
  const [actionType, setActionType] = useState<GliaActionType | null>(null);
  const [status, setStatus] = useState<GliaActionStatus | null>(null);

  const query = trpc.cerebrum.glia.actions.list.useQuery({
    ...(actionType ? { actionType } : {}),
    ...(status ? { status } : {}),
    limit: 100,
  });
  const actions: GliaAction[] = query.data?.actions ?? [];

  return (
    <TooltipProvider>
      <section className="space-y-3">
        <header>
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            {t('glia.audit.title')}
          </h3>
          <p className="text-xs text-muted-foreground">{t('glia.audit.description')}</p>
        </header>
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label={t('glia.audit.filter.type')}
            value={actionType}
            onChange={setActionType}
            options={GLIA_ACTION_TYPES}
            emptyLabel={t('glia.audit.filter.allTypes')}
          />
          <FilterSelect
            label={t('glia.audit.filter.status')}
            value={status}
            onChange={setStatus}
            options={GLIA_ACTION_STATUSES}
            emptyLabel={t('glia.audit.filter.allStatuses')}
          />
        </div>
        <AuditBody query={query} actions={actions} />
      </section>
    </TooltipProvider>
  );
}

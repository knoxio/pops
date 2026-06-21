/**
 * `/food/data/prep-states` tab content (PRD-122-C / Tab 3).
 *
 * Read-only list of all prep states (seeded + user-added) plus an Add
 * button. Per PRD-122 the delete affordance is deliberately omitted —
 * recipe_lines reference prep_states and cascade analysis is deferred
 * to a future PRD. The placeholder UI surfaces this via a disabled
 * delete button with a Tooltip explaining "not in v1".
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@pops/ui';

import { unwrap } from '../../../food-api-helpers.js';
import { prepStatesCreate, prepStatesList } from '../../../food-api/index.js';
import { AddPrepStateDialog } from './AddPrepStateDialog.js';

import type { PrepStatesCreateData, PrepStatesListResponses } from '../../../food-api/types.gen.js';

type PrepStatesListOutput = PrepStatesListResponses[200];
type PrepStatesCreateInput = NonNullable<PrepStatesCreateData['body']>;

export function PrepStatesTabContent() {
  const { t } = useTranslation('food');
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['food', 'prepStates', 'list'],
    queryFn: async (): Promise<PrepStatesListOutput> => unwrap(await prepStatesList({})),
  });
  const [addOpen, setAddOpen] = useState(false);
  const createMutation = useMutation({
    mutationFn: async (input: PrepStatesCreateInput) =>
      unwrap(await prepStatesCreate({ body: input })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['food', 'prepStates', 'list'] });
      setAddOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rows = list.data?.items ?? [];
  const sortedRows = [...rows].toSorted((a, b) => a.slug.localeCompare(b.slug));

  return (
    <section className="space-y-4" aria-labelledby="prep-states-tab-heading">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 id="prep-states-tab-heading" className="text-xl font-semibold">
            {t('data.prepStates.title')}
          </h2>
          <p className="text-muted-foreground text-sm">{t('data.prepStates.description')}</p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm">
          {t('data.prepStates.toolbar.add')}
        </Button>
      </header>

      <PrepStatesBody isLoading={list.isLoading} isError={list.isError} rows={sortedRows} />

      <AddPrepStateDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={(input) => createMutation.mutate(input)}
        isSubmitting={createMutation.isPending}
      />
    </section>
  );
}

interface PrepStateRowShape {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
}

function PrepStatesTable({ rows }: { rows: readonly PrepStateRowShape[] }) {
  const { t } = useTranslation('food');
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('data.prepStates.columns.slug')}</TableHead>
          <TableHead>{t('data.prepStates.columns.name')}</TableHead>
          <TableHead className="w-32" aria-hidden="true" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} data-testid={`prep-state-row-${row.id}`}>
            <TableCell className="font-mono text-sm">{row.slug}</TableCell>
            <TableCell>{row.name}</TableCell>
            <TableCell className="text-right">
              <DisabledDeleteButton />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DisabledDeleteButton() {
  const { t } = useTranslation('food');
  // Tooltip-on-focus has to work for keyboard users, so the button stays
  // focusable but reports its disabled state via `aria-disabled` and a
  // suppressed click handler. A `disabled` HTML button can't receive
  // focus, which would hide the tooltip from anyone not using a pointer
  // (Copilot review on PR #2724).
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            aria-disabled="true"
            aria-label={t('data.prepStates.deleteDisabledAria')}
            className="cursor-not-allowed opacity-50"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {t('data.prepStates.row.delete')}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('data.prepStates.deleteDisabledTooltip')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface PrepStatesBodyProps {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly rows: readonly PrepStateRowShape[];
}

function PrepStatesBody({ isLoading, isError, rows }: PrepStatesBodyProps) {
  const { t } = useTranslation('food');
  if (isLoading)
    return <p className="text-muted-foreground text-sm">{t('data.prepStates.status.loading')}</p>;
  if (isError)
    return <p className="text-destructive text-sm">{t('data.prepStates.status.error')}</p>;
  if (rows.length === 0)
    return <p className="text-muted-foreground text-sm">{t('data.prepStates.status.empty')}</p>;
  return <PrepStatesTable rows={rows} />;
}

/**
 * `/food/data/prep-states` tab content (PRD-122-C / Tab 3).
 *
 * Read-only list of all prep states (seeded + user-added) plus an Add
 * button. Per PRD-122 the delete affordance is deliberately omitted —
 * recipe_lines reference prep_states and cascade analysis is deferred
 * to a future PRD. The placeholder UI surfaces this via a disabled
 * delete button with a Tooltip explaining "not in v1".
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
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

import { AddPrepStateDialog } from './AddPrepStateDialog';

export function PrepStatesTabContent() {
  const { t } = useTranslation('food');
  const utils = trpc.useUtils();
  const list = trpc.food.prepStates.list.useQuery();
  const [addOpen, setAddOpen] = useState(false);
  const createMutation = trpc.food.prepStates.create.useMutation({
    onSuccess: () => {
      void utils.food.prepStates.list.invalidate();
      setAddOpen(false);
    },
    onError: (err) => toast.error(err.message),
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
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/*
           * Wrapping `<span>` keeps the tooltip trigger reachable even
           * though the inner button is `disabled` (disabled controls
           * don't receive focus). The span has no tabIndex per
           * jsx-a11y/no-noninteractive-tabindex — pointer hover is the
           * primary discovery affordance; keyboard users land here via
           * the row's other interactive controls and read the disabled
           * button's aria-label.
           */}
          <span>
            <Button
              size="sm"
              variant="ghost"
              disabled
              aria-label={t('data.prepStates.deleteDisabledAria')}
            >
              {t('data.prepStates.row.delete')}
            </Button>
          </span>
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

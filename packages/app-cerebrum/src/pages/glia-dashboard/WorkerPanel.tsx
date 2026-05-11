/**
 * Glia worker run-once panel.
 *
 * Surfaces the four BullMQ-backed curation workers (pruner,
 * consolidator, linker, auditor) with a single run-with-dry-run
 * checkbox each. Mirrors `cerebrum.glia.run{Pruner,Consolidator,Linker,Auditor}`.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Button, Checkbox } from '@pops/ui';

import { extractMessage } from '../../utils/errors';
import { TOUCH_TARGET_MIN_HEIGHT } from '../../utils/touchTarget';

import type { GliaWorkerKey } from '../../glia/types';

interface WorkerMutationState {
  isPending: boolean;
  mutate: (input: { dryRun: boolean }, opts: { onSuccess: () => void }) => void;
}

function useSharedCallbacks() {
  const { t } = useTranslation('cerebrum');
  const utils = trpc.useUtils();
  return {
    onSuccess: () => utils.cerebrum.glia.actions.list.invalidate(),
    onError: (err: unknown) => toast.error(extractMessage(err, t('errors.unknown'))),
  };
}

function usePrunerMutation(): WorkerMutationState {
  return trpc.cerebrum.glia.runPruner.useMutation(useSharedCallbacks());
}

function useConsolidatorMutation(): WorkerMutationState {
  return trpc.cerebrum.glia.runConsolidator.useMutation(useSharedCallbacks());
}

function useLinkerMutation(): WorkerMutationState {
  return trpc.cerebrum.glia.runLinker.useMutation(useSharedCallbacks());
}

function useAuditorMutation(): WorkerMutationState {
  return trpc.cerebrum.glia.runAuditor.useMutation(useSharedCallbacks());
}

interface WorkerRowProps {
  worker: GliaWorkerKey;
  label: string;
  mutation: WorkerMutationState;
}

function WorkerRow({ worker, label, mutation }: WorkerRowProps) {
  const { t } = useTranslation('cerebrum');
  const [dryRun, setDryRun] = useState(true);

  const handleRun = () => {
    mutation.mutate(
      { dryRun },
      {
        onSuccess: () => toast.success(t('glia.workers.success', { worker: label })),
      }
    );
  };

  return (
    <div
      data-testid={`glia-worker-${worker}`}
      className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3"
    >
      <div className="flex-1">
        <p className="font-medium text-sm">{label}</p>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={dryRun}
          onCheckedChange={(next) => setDryRun(next === true)}
          aria-label={t('glia.workers.dryRun')}
        />
        {t('glia.workers.dryRun')}
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={mutation.isPending}
        className={TOUCH_TARGET_MIN_HEIGHT}
        onClick={handleRun}
      >
        {mutation.isPending ? t('glia.workers.running') : t('glia.workers.run')}
      </Button>
    </div>
  );
}

function PrunerRow({ label }: { label: string }) {
  return <WorkerRow worker="pruner" label={label} mutation={usePrunerMutation()} />;
}

function ConsolidatorRow({ label }: { label: string }) {
  return <WorkerRow worker="consolidator" label={label} mutation={useConsolidatorMutation()} />;
}

function LinkerRow({ label }: { label: string }) {
  return <WorkerRow worker="linker" label={label} mutation={useLinkerMutation()} />;
}

function AuditorRow({ label }: { label: string }) {
  return <WorkerRow worker="auditor" label={label} mutation={useAuditorMutation()} />;
}

export function WorkerPanel() {
  const { t } = useTranslation('cerebrum');
  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          {t('glia.workers.title')}
        </h3>
        <p className="text-xs text-muted-foreground">{t('glia.workers.description')}</p>
      </header>
      <div className="space-y-2" data-testid="glia-worker-list">
        <PrunerRow label={t('glia.workers.pruner')} />
        <ConsolidatorRow label={t('glia.workers.consolidator')} />
        <LinkerRow label={t('glia.workers.linker')} />
        <AuditorRow label={t('glia.workers.auditor')} />
      </div>
    </section>
  );
}

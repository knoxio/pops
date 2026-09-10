import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { PageHeader } from '@pops/ui';

import { DraftGateNotice } from '../components/imports/DraftGateNotice';
import { claimDraft, useDraftHydration } from '../components/imports/hooks/useDraftHydration';
import { useDraftWriteThrough } from '../components/imports/hooks/useDraftWriteThrough';
import { useImportPrescope } from '../components/imports/hooks/useImportPrescope';
import { ImportTakenOverNotice } from '../components/imports/ImportTakenOverNotice';
import { ImportWizard } from '../components/imports/ImportWizard';
import { useImportStore } from '../store/importStore';

/**
 * The lease as the page sees it: `epoch` restarts the write-through after a
 * take-back, `takenOverAt` is set the moment a write or heartbeat learns
 * another tab holds the draft.
 */
function useLeaseLoss() {
  const [takenOverAt, setTakenOverAt] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const draftId = useImportStore((state) => state.draftId);

  const onOwnedElsewhere = useCallback(() => setTakenOverAt(new Date().toISOString()), []);
  const takeBack = useCallback(() => {
    if (draftId === null) return;
    void claimDraft(draftId, true).then(() => {
      setTakenOverAt(null);
      setEpoch((n) => n + 1);
    });
  }, [draftId]);

  return { takenOverAt, epoch, onOwnedElsewhere, takeBack };
}

/**
 * Import page. The draft in `?draft=<id>` is the run (finance ADR-005): the
 * page hydrates the wizard from it, claims it, and mirrors every change back
 * to it. With no draft the wizard starts fresh and the first parsed rows
 * create one, which the page then puts in the URL. The wizard mounts only
 * once the draft is settled, so no step side-effect (Process's auto-start
 * POST) fires against state that is about to be replaced.
 */
export function ImportPage() {
  const { t } = useTranslation('finance');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get('draft');
  const { gate, takeOver, discard } = useDraftHydration(requested);
  const draftId = useImportStore((state) => state.draftId);
  const ready = gate.status === 'ready';
  const lease = useLeaseLoss();

  useEffect(() => {
    if (gate.status === 'gone') {
      toast.info(t('import.draft.gone'));
      setParams({}, { replace: true });
      return;
    }
    if (ready && draftId !== null && requested !== draftId) {
      setParams({ draft: draftId }, { replace: true });
    }
  }, [gate.status, ready, draftId, requested, setParams, t]);

  useDraftWriteThrough({
    enabled: ready && lease.takenOverAt === null,
    epoch: lease.epoch,
    onOwnedElsewhere: lease.onOwnedElsewhere,
    onSaveFailed: useCallback(() => toast.warning(t('import.draft.saveFailed')), [t]),
  });
  useImportPrescope(ready && requested === null);

  return (
    <div className="space-y-6">
      <PageHeader title={t('import.title')} description={t('import.description')} />

      <DraftGateNotice gate={gate} onDiscard={() => void discard()} onTakeOver={takeOver} />
      {ready && <ImportWizard />}
      {lease.takenOverAt !== null && (
        <ImportTakenOverNotice
          takenAt={lease.takenOverAt}
          onTakeBack={lease.takeBack}
          onLeave={() => void navigate('/finance')}
        />
      )}
    </div>
  );
}

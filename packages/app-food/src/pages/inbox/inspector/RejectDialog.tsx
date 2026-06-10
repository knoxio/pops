/**
 * PRD-135 — reject dialog. Reason picker (5-value enum) + optional note;
 * the note becomes required when reason is `other`. Wraps PRD-136's
 * `food.inbox.reject` mutation; navigates back to the inbox Drafts tab
 * on success.
 */
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

const REASONS = [
  'wrong-recipe',
  'low-quality-extraction',
  'duplicate',
  'not-a-recipe',
  'other',
] as const;

type Reason = (typeof REASONS)[number];

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  versionId: number;
  onRejected: () => void;
}

export function RejectDialog({ open, onOpenChange, versionId, onRejected }: Props): ReactElement {
  const { t } = useTranslation('food');
  const navigate = useNavigate();
  const [reason, setReason] = useState<Reason>('wrong-recipe');
  const [note, setNote] = useState('');
  const noteRequired = reason === 'other' && note.trim().length === 0;
  const mutation = trpc.food.inbox.reject.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(t('inbox.inspector.decision.reject.success'));
        onRejected();
        onOpenChange(false);
        void navigate('/food/inbox?tab=drafts');
      } else {
        toast.error(t(`inbox.inspector.decision.reject.error.${res.reason}` as const));
      }
    },
    onError: (err) =>
      toast.error(t('inbox.inspector.decision.reject.error.generic', { message: err.message })),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="inspector-reject-dialog">
        <DialogHeader>
          <DialogTitle>{t('inbox.inspector.decision.reject.title')}</DialogTitle>
        </DialogHeader>
        <RejectForm
          reason={reason}
          onReasonChange={setReason}
          note={note}
          onNoteChange={setNote}
          t={t}
        />
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            {t('inbox.inspector.decision.reject.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={mutation.isPending || noteRequired}
            onClick={() =>
              mutation.mutate({ versionId, reason, note: note.trim() === '' ? undefined : note })
            }
            data-testid="inspector-reject-confirm"
          >
            {mutation.isPending
              ? t('inbox.inspector.decision.reject.submitting')
              : t('inbox.inspector.decision.reject.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RejectFormProps {
  reason: Reason;
  onReasonChange: (next: Reason) => void;
  note: string;
  onNoteChange: (next: string) => void;
  t: (k: string) => string;
}

function RejectForm({
  reason,
  onReasonChange,
  note,
  onNoteChange,
  t,
}: RejectFormProps): ReactElement {
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">
          {t('inbox.inspector.decision.reject.reasonLabel')}
        </span>
        <select
          value={reason}
          onChange={(e) => onReasonChange(e.target.value as Reason)}
          className="w-full rounded border px-2 py-1"
          data-testid="inspector-reject-reason"
        >
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`inbox.rejected.reason.${r}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">
          {t('inbox.inspector.decision.reject.noteLabel')}
        </span>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={3}
          className="w-full rounded border px-2 py-1"
          data-testid="inspector-reject-note"
        />
      </label>
    </div>
  );
}

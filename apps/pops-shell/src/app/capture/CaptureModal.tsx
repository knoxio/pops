/**
 * CaptureModal — global capture surface rendered as a Dialog (PRD-081 US-09).
 * Renders the same IngestForm component used by the /cerebrum route, so the
 * modal and the page share keyboard handling, scope autocomplete, Advanced
 * disclosure, and bulk-paste behaviour.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { IngestForm, useIngestPageModel } from '@pops/app-cerebrum';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pops/ui';

interface CaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CaptureModal({ open, onOpenChange }: CaptureModalProps) {
  const { t } = useTranslation('cerebrum');
  const model = useIngestPageModel();

  const handleOpenChange = useCallback(
    (next: boolean) => {
      // Backdrop close (next=false from the radix overlay) is only allowed when
      // the body is empty — protects against losing in-progress text.
      if (!next && model.form.body.length > 0 && !model.bulkResults && !model.submitResult) {
        // Let Esc handling inside the body editor manage discard-confirm. The
        // backdrop simply does nothing when there is unsaved text.
        return;
      }
      onOpenChange(next);
    },
    [model.form.body.length, model.bulkResults, model.submitResult, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl"
        onEscapeKeyDown={(event) => {
          // Esc closes only when the body is empty (or after a successful
          // capture) — otherwise the IngestForm handles Esc by clearing the
          // body with an Undo toast.
          if (model.form.body.length > 0 && !model.bulkResults && !model.submitResult) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('ingest.title')}</DialogTitle>
          <DialogDescription>{t('ingest.description')}</DialogDescription>
        </DialogHeader>
        <IngestForm model={model} />
      </DialogContent>
    </Dialog>
  );
}

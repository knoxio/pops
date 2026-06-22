import { CheckCircle2, RefreshCw } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog';
import { Button } from './Button';

import type { ReactNode } from 'react';

/**
 * Shared modal shell for Radarr/Sonarr-style request flows.
 */
export interface RequestDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  isLoading?: boolean;
  error?: string | null;
  canSubmit: boolean;
  isPending: boolean;
  isSuccess: boolean;
  submitLabel?: string;
  successLabel?: string;
  pendingLabel?: string;
  onSubmit: () => void;
  children: ReactNode;
}

function SubmitButtonLabel({
  isPending,
  isSuccess,
  pendingLabel,
  successLabel,
  submitLabel,
}: {
  isPending: boolean;
  isSuccess: boolean;
  pendingLabel: string;
  successLabel: string;
  submitLabel: string;
}) {
  if (isSuccess) {
    return (
      <>
        <CheckCircle2 className="h-4 w-4 mr-1.5" />
        {successLabel}
      </>
    );
  }
  if (isPending) {
    return (
      <>
        <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
        {pendingLabel}
      </>
    );
  }
  return <>{submitLabel}</>;
}

export function RequestDialog({
  open,
  onClose,
  title,
  description,
  isLoading,
  error,
  canSubmit,
  isPending,
  isSuccess,
  submitLabel = 'Request',
  successLabel = 'Added',
  pendingLabel = 'Adding...',
  onSubmit,
  children,
}: RequestDialogProps) {
  const handleClose = () => {
    if (!isPending) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Loading options...
            </div>
          ) : (
            children
          )}
          {error && <p className="text-sm text-destructive/80">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={onSubmit} disabled={!canSubmit}>
              <SubmitButtonLabel
                isPending={!!isPending}
                isSuccess={isSuccess}
                pendingLabel={pendingLabel}
                successLabel={successLabel}
                submitLabel={submitLabel}
              />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

RequestDialog.displayName = 'RequestDialog';

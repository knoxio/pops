import { useTranslation } from 'react-i18next';

/**
 * ScopeConfirmDialog — shown when the user submits without explicit scopes
 * and scope inference returns results. Presents inferred scopes for
 * confirmation before final submission.
 */
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

interface ScopeConfirmDialogProps {
  open: boolean;
  scopes: string[];
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ScopeConfirmDialog({
  open,
  scopes,
  onConfirm,
  onDismiss,
}: ScopeConfirmDialogProps) {
  const { t } = useTranslation('cerebrum');
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onDismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ingest.inferredScopes')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('ingest.noScopesProvided')}</p>
        <div className="flex flex-wrap gap-2 py-2">
          {scopes.map((scope) => (
            <Badge key={scope} variant="secondary">
              {scope}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{t('ingest.acceptScopesHint')}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button onClick={onConfirm}>{t('ingest.acceptAndSubmit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

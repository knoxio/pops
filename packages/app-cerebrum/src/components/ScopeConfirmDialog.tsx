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
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onDismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inferred Scopes</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          No scopes were provided. The following scopes were inferred from the content:
        </p>
        <div className="flex flex-wrap gap-2 py-2">
          {scopes.map((scope) => (
            <Badge key={scope} variant="secondary">
              {scope}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Accept these scopes to continue submitting, or dismiss to add scopes manually.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button onClick={onConfirm}>Accept &amp; Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * PRD-135 — approve confirmation dialog. Wraps PRD-136's
 * `food.inbox.approve` mutation. On success navigates to the promoted
 * recipe's detail page.
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  versionId: number;
  recipeSlug: string;
  onApproved: () => void;
}

export function ApproveDialog({
  open,
  onOpenChange,
  versionId,
  recipeSlug,
  onApproved,
}: Props): ReactElement {
  const { t } = useTranslation('food');
  const navigate = useNavigate();
  const mutation = trpc.food.inbox.approve.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(t('inbox.inspector.decision.approve.success'));
        onApproved();
        onOpenChange(false);
        void navigate(`/food/recipes/${recipeSlug}`);
      } else {
        toast.error(t(`inbox.inspector.decision.approve.error.${res.reason}` as const));
      }
    },
    onError: (err) =>
      toast.error(t('inbox.inspector.decision.approve.error.generic', { message: err.message })),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="inspector-approve-dialog">
        <DialogHeader>
          <DialogTitle>{t('inbox.inspector.decision.approve.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          {t('inbox.inspector.decision.approve.description', { slug: recipeSlug })}
        </p>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            {t('inbox.inspector.decision.approve.cancel')}
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ versionId })}
            data-testid="inspector-approve-confirm"
          >
            {mutation.isPending
              ? t('inbox.inspector.decision.approve.submitting')
              : t('inbox.inspector.decision.approve.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

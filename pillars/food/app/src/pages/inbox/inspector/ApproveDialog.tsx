import { useMutation } from '@tanstack/react-query';
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

import { unwrap } from '../../../food-api-helpers.js';
import { inboxApprove } from '../../../food-api/index.js';

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
  const mutation = useMutation({
    mutationFn: async (input: { versionId: number }) => unwrap(await inboxApprove({ body: input })),
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
    onError: (err: Error) =>
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

/**
 * Thin mount wrapper for PRD-142's `SendToListModal`.
 *
 * Owns the success-toast presentation so `RecipeDetailPage` can stay
 * declarative and under the per-file lint cap. Mirrors the
 * `ArchiveDialogPortal` pattern.
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { SendToListModal } from './send-to-list/index.js';

import type { SendFlow } from './use-send-flow.js';

interface Props {
  flow: SendFlow;
  versionId: number;
}

export function SendToListPortal({ flow, versionId }: Props): ReactElement {
  const { t } = useTranslation('food');
  const navigate = useNavigate();
  return (
    <SendToListModal
      open={flow.isOpen}
      versionId={versionId}
      onOpenChange={(o) => (o ? flow.open() : flow.close())}
      onSuccess={(outcome) => {
        toast.success(
          t('recipes.detail.sendToList.toast.success', {
            count: outcome.addedCount + outcome.mergedCount,
            listName: outcome.listName,
          }),
          {
            action: {
              label: t('recipes.detail.sendToList.toast.viewList'),
              onClick: () => {
                void navigate(`/lists/${outcome.listId}`);
              },
            },
          }
        );
      }}
    />
  );
}

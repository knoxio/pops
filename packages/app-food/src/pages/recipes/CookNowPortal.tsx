/**
 * Thin mount wrapper for PRD-144's `CookModal`.
 *
 * Mirrors `SendToListPortal` — owns the success-toast presentation so
 * `RecipeDetailPage` stays declarative.
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { CookModal } from '../../components/cook/CookModal.js';
import { useRecipeScale } from './RecipeScaleProvider.js';

import type { CookFlow } from './use-cook-flow.js';

interface Props {
  flow: CookFlow;
  versionId: number;
}

export function CookNowPortal({ flow, versionId }: Props): ReactElement {
  const { t } = useTranslation('food');
  const { scaleFactor } = useRecipeScale();
  const navigate = useNavigate();
  return (
    <CookModal
      recipeVersionId={versionId}
      scaleFactor={scaleFactor}
      isOpen={flow.isOpen}
      onClose={flow.close}
      onCookedSuccess={(result) => {
        if (result.yieldedBatchId !== null) {
          // Localise per chosen location instead of hardcoding "fridge"
          // in the success copy (Copilot R1). i18n provides per-location
          // strings; the `location` discriminator selects which one.
          const locKey = result.location ?? 'fridge';
          toast.success(t(`cook.modal.toast.success.${locKey}`), {
            action: {
              label: t('cook.modal.toast.viewBatch'),
              onClick: () => {
                void navigate(`/food/fridge?batch=${result.yieldedBatchId}`);
              },
            },
          });
        } else {
          toast.success(t('cook.modal.toast.successNoBatch'));
        }
      }}
    />
  );
}

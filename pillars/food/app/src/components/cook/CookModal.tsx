/**
 * PRD-144 — cook event recording modal.
 *
 * Opens from two entry points (PRD-119's "Cook now" action menu and
 * PRD-143's plan-entry "Mark cooked" — when 143 lands). Captures scale,
 * yield, location, expires, rating, notes. The Mark cooked button gates
 * on form validity AND PRD-146's shortfall resolution state (the
 * `useCookResolution` hook is a stub returning `unresolvedCount: 0` for
 * now; PRD-146 wires the real shortfall UI).
 *
 * The mutation is one transactional `food.cook.markCooked` round-trip;
 * success closes the modal — the parent `CookNowPortal` owns the toast.
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

import { isFormValid } from './cook-modal-helpers.js';
import {
  CookModalFooter,
  parseFloatOrOne,
  renderPrepareBranch,
  renderTitle,
  submitIfReady,
  useCookForm,
  usePrepareCook,
} from './CookModalShell.js';
import { useCookResolution } from './useCookResolution.js';
import { useMarkCookedMutation } from './useMarkCookedMutation.js';

export interface CookedSuccess {
  recipeRunId: number;
  yieldedBatchId: number | null;
  /**
   * The location the user selected for the yielded batch, propagated so
   * the parent toast can render a location-aware message instead of
   * hardcoding "fridge" (Copilot R1). `null` for yieldless cooks.
   */
  location: 'pantry' | 'fridge' | 'freezer' | 'other' | null;
}

export interface CookModalProps {
  recipeVersionId: number;
  scaleFactor?: number;
  planEntryId?: number;
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful `food.cook.markCooked`. */
  onCookedSuccess?: (result: CookedSuccess) => void;
}

export function CookModal(props: CookModalProps): ReactElement {
  return (
    <Dialog open={props.isOpen} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogContent>
        <CookModalBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function CookModalBody(props: CookModalProps): ReactElement {
  const { t } = useTranslation('food');
  const prepareQuery = usePrepareCook(props);
  const prep = prepareQuery.data;
  const prepareError = prepareQuery.error;
  const { form, setForm } = useCookForm({ isOpen: props.isOpen, prep });
  const scaleFactor = parseFloatOrOne(form.scaleFactor);
  const resolution = useCookResolution({
    lineNeeds: prep?.consumeNeeds ?? [],
    scaleFactor,
    shortfalls: [],
  });
  const mutation = useMarkCookedMutation({
    onSuccess: props.onCookedSuccess,
    onClose: props.onClose,
  });
  const canSubmit =
    prep !== undefined && isFormValid(prep, form) && resolution.unresolvedShortfallCount === 0;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{renderTitle(t, prep)}</DialogTitle>
      </DialogHeader>
      {renderPrepareBranch({
        prep,
        prepareError,
        form,
        setForm,
        resolution,
        recipeVersionId: props.recipeVersionId,
        mutationErrorMessage: mutation.errorMessage,
        t,
      })}
      <DialogFooter>
        <CookModalFooter
          isPending={mutation.isPending}
          canSubmit={canSubmit}
          onCancel={props.onClose}
          onSubmit={() =>
            submitIfReady({
              props,
              prep,
              form,
              submit: mutation.submit,
              resolutionMap: resolution.resolutionMap,
              needsByLine: resolution.needsByLine,
            })
          }
        />
      </DialogFooter>
    </>
  );
}

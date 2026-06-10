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
import { useEffect, useState, type Dispatch, type ReactElement, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

import { trpc } from '@pops/api-client';
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

import {
  buildSubmitInput,
  initialForm,
  isFormValid,
  seedForm,
  type CookFormState,
} from './cook-modal-helpers.js';
import { CookModalContent } from './CookModalContent.js';
import { useCookResolution } from './useCookResolution.js';
import { useMarkCookedMutation } from './useMarkCookedMutation.js';

import type { CookPreparation } from '@pops/app-food-db';

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
        mutationErrorMessage: mutation.errorMessage,
        t,
      })}
      <DialogFooter>
        <CookModalFooter
          isPending={mutation.isPending}
          canSubmit={canSubmit}
          onCancel={props.onClose}
          onSubmit={() => submitIfReady(props, prep, form, mutation.submit)}
        />
      </DialogFooter>
    </>
  );
}

function usePrepareCook(props: CookModalProps): {
  data: CookPreparation | undefined;
  error: { message: string } | null;
} {
  const query = trpc.food.cook.prepareCook.useQuery(
    {
      recipeVersionId: props.recipeVersionId,
      scaleFactor: props.scaleFactor ?? 1,
      ...(props.planEntryId !== undefined ? { planEntryId: props.planEntryId } : {}),
    },
    { enabled: props.isOpen }
  );
  return { data: query.data, error: query.error ?? null };
}

interface PrepareBranchArgs {
  prep: CookPreparation | undefined;
  prepareError: { message: string } | null;
  form: CookFormState;
  setForm: Dispatch<SetStateAction<CookFormState>>;
  resolution: ReturnType<typeof useCookResolution>;
  mutationErrorMessage: string | null;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function renderPrepareBranch(args: PrepareBranchArgs): ReactElement {
  // Distinguish "still loading" from "prepare errored" so a network or
  // server failure surfaces a real error instead of the perpetual
  // loading copy (Copilot R1).
  if (args.prepareError !== null) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {args.t('cook.modal.error.PrepareFailed', { message: args.prepareError.message })}
      </p>
    );
  }
  if (args.prep === undefined) {
    return <p className="text-sm text-muted-foreground">{args.t('cook.modal.loading')}</p>;
  }
  return (
    <CookModalContent
      prep={args.prep}
      form={args.form}
      setForm={args.setForm}
      resolution={args.resolution}
      errorMessage={args.mutationErrorMessage}
    />
  );
}

function submitIfReady(
  props: CookModalProps,
  prep: CookPreparation | undefined,
  form: CookFormState,
  submit: (input: ReturnType<typeof buildSubmitInput>) => void
): void {
  if (prep === undefined) return;
  submit(
    buildSubmitInput({
      recipeVersionId: props.recipeVersionId,
      planEntryId: props.planEntryId,
      prep,
      form,
    })
  );
}

interface UseCookFormArgs {
  isOpen: boolean;
  prep: CookPreparation | undefined;
}

function useCookForm(args: UseCookFormArgs): {
  form: CookFormState;
  setForm: Dispatch<SetStateAction<CookFormState>>;
} {
  const [form, setForm] = useState<CookFormState>(initialForm);
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!args.isOpen) {
      setForm(initialForm);
      setSeeded(false);
    }
  }, [args.isOpen]);
  useEffect(() => {
    if (!args.isOpen || args.prep === undefined || seeded) return;
    setSeeded(true);
    setForm(seedForm(args.prep));
  }, [args.isOpen, args.prep, seeded]);
  return { form, setForm };
}

interface FooterProps {
  isPending: boolean;
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

function CookModalFooter({ isPending, canSubmit, onCancel, onSubmit }: FooterProps): ReactElement {
  const { t } = useTranslation('food');
  return (
    <>
      <Button variant="outline" type="button" onClick={onCancel}>
        {t('cook.modal.cancel')}
      </Button>
      <Button type="button" disabled={!canSubmit || isPending} onClick={onSubmit}>
        {isPending ? t('cook.modal.submitting') : t('cook.modal.submit')}
      </Button>
    </>
  );
}

function renderTitle(
  t: (key: string, opts?: Record<string, unknown>) => string,
  prep: CookPreparation | undefined
): string {
  if (prep === undefined) return t('cook.modal.titleLoading');
  return t('cook.modal.title', { recipeTitle: prep.recipeTitle });
}

function parseFloatOrOne(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

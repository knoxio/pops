/**
 * CookModal — extracted helpers and presentational pieces.
 *
 * Lives in its own file so `CookModal.tsx` stays under the 200-line
 * per-file lint cap. Nothing here is exported outside this directory.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type Dispatch, type ReactElement, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { unwrap } from '../../food-api-helpers.js';
import { cookPrepareCook } from '../../food-api/index.js';
import {
  buildSubmitInput,
  initialForm,
  seedForm,
  type CookFormState,
} from './cook-modal-helpers.js';
import { CookModalContent } from './CookModalContent.js';

import type { CookPreparation } from './cook-resolution-types.js';
import type { CookModalProps } from './CookModal.js';
import type { useCookResolution } from './useCookResolution.js';

export function usePrepareCook(props: CookModalProps): {
  data: CookPreparation | undefined;
  error: { message: string } | null;
} {
  const input = {
    recipeVersionId: props.recipeVersionId,
    scaleFactor: props.scaleFactor ?? 1,
    ...(props.planEntryId !== undefined ? { planEntryId: props.planEntryId } : {}),
  };
  const query = useQuery({
    queryKey: ['food', 'cook', 'prepare', input],
    queryFn: async () => unwrap(await cookPrepareCook({ body: input })),
    enabled: props.isOpen,
  });
  return {
    data: query.data,
    error: query.error === null ? null : { message: query.error.message },
  };
}

export interface PrepareBranchArgs {
  prep: CookPreparation | undefined;
  prepareError: { message: string } | null;
  form: CookFormState;
  setForm: Dispatch<SetStateAction<CookFormState>>;
  resolution: ReturnType<typeof useCookResolution>;
  recipeVersionId: number;
  mutationErrorMessage: string | null;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function renderPrepareBranch(args: PrepareBranchArgs): ReactElement {
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
      recipeVersionId={args.recipeVersionId}
      errorMessage={args.mutationErrorMessage}
    />
  );
}

export interface SubmitArgs {
  props: CookModalProps;
  prep: CookPreparation | undefined;
  form: CookFormState;
  submit: (input: ReturnType<typeof buildSubmitInput>) => void;
  resolutionMap: ReturnType<typeof useCookResolution>['resolutionMap'];
  needsByLine: ReturnType<typeof useCookResolution>['needsByLine'];
}

export function submitIfReady(args: SubmitArgs): void {
  if (args.prep === undefined) return;
  args.submit(
    buildSubmitInput({
      recipeVersionId: args.props.recipeVersionId,
      planEntryId: args.props.planEntryId,
      prep: args.prep,
      form: args.form,
      resolutionMap: args.resolutionMap,
      needsByLine: args.needsByLine,
    })
  );
}

export interface UseCookFormArgs {
  isOpen: boolean;
  prep: CookPreparation | undefined;
}

export function useCookForm(args: UseCookFormArgs): {
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

export interface FooterProps {
  isPending: boolean;
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

export function CookModalFooter({
  isPending,
  canSubmit,
  onCancel,
  onSubmit,
}: FooterProps): ReactElement {
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

export function renderTitle(
  t: (key: string, opts?: Record<string, unknown>) => string,
  prep: CookPreparation | undefined
): string {
  if (prep === undefined) return t('cook.modal.titleLoading');
  return t('cook.modal.title', { recipeTitle: prep.recipeTitle });
}

export function parseFloatOrOne(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

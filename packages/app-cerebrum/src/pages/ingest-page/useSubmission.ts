/**
 * Sub-hook: routes the capture surface to the appropriate API path.
 *
 * - When no Advanced fields have been touched and the body has no `---`
 *   separators, calls `cerebrum.ingest.quickCapture` (US-01 single capture).
 * - When the body contains `---` separators (or the user forced a split via
 *   Cmd/Ctrl+Shift+Enter), calls `quickCapture` once per non-empty segment
 *   sequentially (US-08 bulk paste).
 * - When Advanced has been touched, calls `cerebrum.ingest.submit` (single).
 */
import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { ingestQuickCapture, ingestSubmit } from '../../cerebrum-api';
import { unwrap } from '../../cerebrum-api-helpers';
import {
  asResult,
  buildQuickCapturePayload,
  retrySegmentImpl,
  runBulk,
  toQuickCaptureShape,
} from './submission-helpers';

import type {
  QuickCaptureMutation,
  QuickCapturePayload,
  SetBulkResults,
  SubmitMutation,
  SubmitPayload,
} from './submission-types';
import type { BulkSegmentOutcome, IngestFormValues, SubmitResult } from './types';
import type { useFormState } from './useFormState';

type FormState = ReturnType<typeof useFormState>;

function buildSubmitPayload(form: IngestFormValues): SubmitPayload {
  return {
    body: form.body,
    title: form.title || undefined,
    type: form.type || undefined,
    scopes: form.scopes.length > 0 ? form.scopes : undefined,
    tags: form.tags.length > 0 ? form.tags : undefined,
    template: form.template || undefined,
    source: 'manual',
    customFields: Object.keys(form.customFields).length > 0 ? form.customFields : undefined,
  };
}

function useIngestMutations(setSubmitResult: (next: SubmitResult | null) => void) {
  const submitMutation = useMutation({
    mutationFn: async (payload: SubmitPayload) => unwrap(await ingestSubmit({ body: payload })),
    onSuccess: (result) => setSubmitResult(asResult(toQuickCaptureShape(result))),
    onError: (error: Error) => toast.error('Submit Engram failed', { description: error.message }),
  });
  const quickCaptureMutation = useMutation({
    mutationFn: async (payload: QuickCapturePayload) =>
      unwrap(await ingestQuickCapture({ body: payload })),
    onError: (error: Error) => toast.error('Capture failed', { description: error.message }),
  });
  return { submitMutation, quickCaptureMutation };
}

export function useSubmission(formState: FormState) {
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [bulkResults, setBulkResults] = useState<BulkSegmentOutcome[] | null>(null);
  const [bulkInFlight, setBulkInFlight] = useState(false);

  const { submitMutation, quickCaptureMutation } = useIngestMutations(setSubmitResult);

  const handleSubmit = useCallback(
    (options?: { forceBulk?: boolean }) => {
      void dispatchSubmit({
        formState,
        submitMutation,
        quickCaptureMutation,
        forceBulk: options?.forceBulk ?? false,
        setSubmitResult,
        setBulkResults,
        setBulkInFlight,
      });
    },
    [formState, submitMutation, quickCaptureMutation]
  );

  const retrySegment = useCallback(
    (segmentIndex: number) =>
      retrySegmentImpl({
        segmentIndex,
        formValues: formState.form,
        bulkResults,
        mutateAsync: quickCaptureMutation.mutateAsync,
        setBulkResults,
      }),
    [bulkResults, formState.form, quickCaptureMutation]
  );

  const resetForm = useCallback(() => {
    formState.resetForm();
    setSubmitResult(null);
    setBulkResults(null);
  }, [formState]);

  const isSubmitting = submitMutation.isPending || quickCaptureMutation.isPending || bulkInFlight;
  const submitError = submitMutation.error?.message ?? null;

  return {
    handleSubmit,
    retrySegment,
    isSubmitting,
    submitError,
    submitResult,
    bulkResults,
    resetForm,
  };
}

interface DispatchArgs {
  formState: FormState;
  submitMutation: SubmitMutation;
  quickCaptureMutation: QuickCaptureMutation;
  forceBulk: boolean;
  setSubmitResult: (next: SubmitResult | null) => void;
  setBulkResults: SetBulkResults;
  setBulkInFlight: (next: boolean) => void;
}

async function dispatchSubmit(args: DispatchArgs): Promise<void> {
  const { formState, submitMutation, quickCaptureMutation, forceBulk } = args;
  const { form, advancedTouched, segments } = formState;
  if (advancedTouched) {
    submitMutation.mutate(buildSubmitPayload(form));
    return;
  }
  if ((forceBulk || segments.length > 1) && segments.length > 0) {
    await runBulk({
      form,
      segments,
      mutateAsync: quickCaptureMutation.mutateAsync,
      setBulkResults: args.setBulkResults,
      setBulkInFlight: args.setBulkInFlight,
    });
    return;
  }
  const r = await quickCaptureMutation.mutateAsync(buildQuickCapturePayload(form));
  args.setSubmitResult(asResult(r));
}

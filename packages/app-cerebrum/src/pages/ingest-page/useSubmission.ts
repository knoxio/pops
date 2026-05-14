/**
 * Sub-hook: routes the capture surface to the appropriate API path.
 *
 * - When no Advanced fields have been touched, calls `cerebrum.ingest.quickCapture`
 *   (US-01 capture-first path) — the body is written immediately, the server
 *   enqueues async enrichment, and the user's typed scopes (if any) flow
 *   through as suggestions for reconciliation by US-10.
 * - When Advanced has been touched (type/template/tags/customFields), calls
 *   `cerebrum.ingest.submit` so the explicit fields bypass classification per
 *   PRD-081 business rules.
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { SubmitResult } from './types';
import type { useFormState } from './useFormState';

type FormState = ReturnType<typeof useFormState>;
type FormValues = FormState['form'];

function buildSubmitPayload(form: FormValues) {
  return {
    body: form.body,
    title: form.title || undefined,
    type: form.type || undefined,
    scopes: form.scopes.length > 0 ? form.scopes : undefined,
    tags: form.tags.length > 0 ? form.tags : undefined,
    template: form.template || undefined,
    source: 'manual' as const,
    customFields: Object.keys(form.customFields).length > 0 ? form.customFields : undefined,
  };
}

function buildQuickCapturePayload(form: FormValues) {
  return {
    text: form.body,
    source: 'manual' as const,
    scopes: form.scopes.length > 0 ? form.scopes : undefined,
  };
}

export function useSubmission(formState: FormState) {
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  const onSuccess = useCallback((result: { id: string; filePath: string; type: string }) => {
    setSubmitResult({ id: result.id, filePath: result.filePath, type: result.type });
  }, []);

  const submitMutation = trpc.cerebrum.ingest.submit.useMutation({
    onSuccess: (result) => {
      onSuccess({
        id: result.engram.id,
        filePath: result.engram.filePath,
        type: result.engram.type,
      });
    },
    onError: (error) => {
      toast.error('Submit Engram failed', { description: error.message });
    },
  });

  const quickCaptureMutation = trpc.cerebrum.ingest.quickCapture.useMutation({
    onSuccess: (result) => {
      onSuccess({ id: result.id, filePath: result.path, type: result.type });
    },
    onError: (error) => {
      toast.error('Capture failed', { description: error.message });
    },
  });

  const handleSubmit = useCallback(() => {
    const { form, advancedTouched } = formState;
    if (advancedTouched) {
      submitMutation.mutate(buildSubmitPayload(form));
    } else {
      quickCaptureMutation.mutate(buildQuickCapturePayload(form));
    }
  }, [formState, submitMutation, quickCaptureMutation]);

  const resetForm = useCallback(() => {
    formState.resetForm();
    setSubmitResult(null);
  }, [formState]);

  const isSubmitting = submitMutation.isPending || quickCaptureMutation.isPending;
  const submitError = submitMutation.error?.message ?? quickCaptureMutation.error?.message ?? null;

  return {
    handleSubmit,
    isSubmitting,
    submitError,
    submitResult,
    resetForm,
  };
}

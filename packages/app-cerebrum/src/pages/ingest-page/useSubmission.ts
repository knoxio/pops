/** Sub-hook: submit mutation and orchestration with scope inference. */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { SubmitResult } from './types';
import type { useFormState } from './useFormState';
import type { useScopeInference } from './useScopeInference';

type FormState = ReturnType<typeof useFormState>;
type Inference = ReturnType<typeof useScopeInference>;
type FormValues = FormState['form'];

function buildSubmitPayload(form: FormValues, scopes: string[]) {
  return {
    body: form.body,
    title: form.title || undefined,
    type: form.type || undefined,
    scopes: scopes.length > 0 ? scopes : undefined,
    tags: form.tags.length > 0 ? form.tags : undefined,
    template: form.template || undefined,
    source: 'manual' as const,
    customFields: Object.keys(form.customFields).length > 0 ? form.customFields : undefined,
  };
}

export function useSubmission(formState: FormState, inference: Inference) {
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  const submitMutation = trpc.cerebrum.ingest.submit.useMutation({
    onSuccess: (result) => {
      setSubmitResult({
        id: result.engram.id,
        filePath: result.engram.filePath,
        type: result.engram.type,
      });
    },
    onError: (error) => {
      toast.error('Submit Engram failed', { description: error.message });
    },
  });

  const confirmInferredScopes = useCallback(() => {
    inference.confirm((scopes) => {
      const mergedScopes = [...new Set([...formState.form.scopes, ...scopes])];
      formState.updateField('scopes', mergedScopes);
      submitMutation.mutate(buildSubmitPayload(formState.form, mergedScopes));
    });
  }, [inference, formState, submitMutation]);

  const handleSubmit = useCallback(async () => {
    const { form } = formState;
    if (form.scopes.length === 0 && !inference.showScopeConfirm) {
      await inference.run();
      return;
    }
    submitMutation.mutate(buildSubmitPayload(form, form.scopes));
  }, [formState, inference, submitMutation]);

  const resetForm = useCallback(() => {
    formState.resetForm();
    setSubmitResult(null);
  }, [formState]);

  return {
    confirmInferredScopes,
    handleSubmit,
    isSubmitting: submitMutation.isPending,
    submitError: submitMutation.error?.message ?? null,
    submitResult,
    resetForm,
  };
}

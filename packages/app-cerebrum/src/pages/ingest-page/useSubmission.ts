/** Sub-hook: submit mutation and orchestration with scope inference. */
import { useCallback, useState } from 'react';

import { trpc } from '@pops/api-client';

import type { SubmitResult } from './types';
import type { useFormState } from './useFormState';
import type { useScopeInference } from './useScopeInference';

type FormState = ReturnType<typeof useFormState>;
type Inference = ReturnType<typeof useScopeInference>;

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
  });

  const confirmInferredScopes = useCallback(() => {
    inference.confirm((scopes) => {
      formState.updateField('scopes', [...new Set([...formState.form.scopes, ...scopes])]);
    });
  }, [inference, formState]);

  const handleSubmit = useCallback(async () => {
    const { form } = formState;
    if (form.scopes.length === 0 && !inference.showScopeConfirm) {
      await inference.run();
      return;
    }
    submitMutation.mutate({
      body: form.body,
      title: form.title || undefined,
      type: form.type || undefined,
      scopes: form.scopes.length > 0 ? form.scopes : undefined,
      tags: form.tags.length > 0 ? form.tags : undefined,
      template: form.template || undefined,
      source: 'manual',
      customFields: Object.keys(form.customFields).length > 0 ? form.customFields : undefined,
    });
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

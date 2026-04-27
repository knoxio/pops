/**
 * View model hook for the IngestPage.
 *
 * Composed from focused sub-hooks (data, form, inference, submission)
 * to keep each function under the line limit and stabilise dependencies.
 */
import { useFormState } from './useFormState';
import { useScopeInference } from './useScopeInference';
import { useSubmission } from './useSubmission';
import { useTemplateAndScopeData } from './useTemplateAndScopeData';

export type { IngestFormValues, SubmitResult } from './types';

export function useIngestPageModel() {
  const data = useTemplateAndScopeData();
  const formState = useFormState(data.templates);
  const inference = useScopeInference(formState.form, data.knownScopes);
  const submission = useSubmission(formState, inference);

  return {
    form: formState.form,
    updateField: formState.updateField,
    updateCustomField: formState.updateCustomField,
    handleTypeChange: formState.handleTypeChange,
    isValid: formState.isValid,
    typeOptions: data.typeOptions,
    selectedTemplate: formState.selectedTemplate,
    scopeSuggestions: data.scopeSuggestions,
    templatesLoading: data.templatesLoading,
    scopesLoading: data.scopesLoading,
    inferredScopes: inference.inferredScopes,
    showScopeConfirm: inference.showScopeConfirm,
    isInferring: inference.isInferring,
    confirmInferredScopes: submission.confirmInferredScopes,
    dismissInferredScopes: inference.dismiss,
    handleSubmit: submission.handleSubmit,
    isSubmitting: submission.isSubmitting,
    submitError: submission.submitError,
    submitResult: submission.submitResult,
    resetForm: submission.resetForm,
  };
}

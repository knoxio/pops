/**
 * View model hook for the IngestPage.
 *
 * Composed from focused sub-hooks (data, form, submission). The capture-first
 * surface (PRD-081 US-01) is the default; Advanced fields live behind a
 * disclosure and only route through `submit` when explicitly touched.
 */
import { useFormState } from './useFormState';
import { useSubmission } from './useSubmission';
import { useTemplateAndScopeData } from './useTemplateAndScopeData';

export type { IngestFormValues, SubmitResult } from './types';

export function useIngestPageModel() {
  const data = useTemplateAndScopeData();
  const formState = useFormState(data.templates);
  const submission = useSubmission(formState);

  return {
    form: formState.form,
    updateField: formState.updateField,
    updateCustomField: formState.updateCustomField,
    handleTypeChange: formState.handleTypeChange,
    isValid: formState.isValid,
    advancedTouched: formState.advancedTouched,
    segments: formState.segments,
    typeOptions: data.typeOptions,
    selectedTemplate: formState.selectedTemplate,
    scopeSuggestions: data.scopeSuggestions,
    tagSuggestions: data.tagSuggestions,
    templatesLoading: data.templatesLoading,
    scopesLoading: data.scopesLoading,
    tagsLoading: data.tagsLoading,
    handleSubmit: submission.handleSubmit,
    retrySegment: submission.retrySegment,
    isSubmitting: submission.isSubmitting,
    submitError: submission.submitError,
    submitResult: submission.submitResult,
    bulkResults: submission.bulkResults,
    resetForm: submission.resetForm,
  };
}

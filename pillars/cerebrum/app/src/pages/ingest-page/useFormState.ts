/** Sub-hook: form value state, field updaters, type change handler. */
import { useCallback, useMemo, useState } from 'react';

import { splitOnSeparator } from './bulk-paste';
import { INITIAL_FORM } from './types';

import type { IngestFormValues, TemplateSummary } from './types';

const DEFAULT_TYPE = INITIAL_FORM.type;

/**
 * The Advanced disclosure is considered "touched" when any of its fields
 * has a non-default value. The capture surface routes through `quickCapture`
 * unless `advancedTouched` is true (in which case `submit` is used so explicit
 * fields bypass classification per PRD-081 business rules).
 */
function isAdvancedTouched(form: IngestFormValues): boolean {
  return (
    form.type !== DEFAULT_TYPE ||
    form.template.length > 0 ||
    form.tags.length > 0 ||
    Object.keys(form.customFields).length > 0
  );
}

export function useFormState(templates: TemplateSummary[]) {
  const [form, setForm] = useState<IngestFormValues>(INITIAL_FORM);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.name === form.type) ?? null,
    [templates, form.type]
  );

  const updateField = useCallback(
    <K extends keyof IngestFormValues>(key: K, value: IngestFormValues[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const updateCustomField = useCallback((fieldName: string, value: unknown) => {
    setForm((prev) => ({
      ...prev,
      customFields: { ...prev.customFields, [fieldName]: value },
    }));
  }, []);

  const handleTypeChange = useCallback(
    (value: string) => {
      setForm((prev) => {
        const tpl = templates.find((t) => t.name === value);
        return {
          ...prev,
          type: value,
          template: tpl ? tpl.name : '',
          customFields: {},
        };
      });
    },
    [templates]
  );

  const resetForm = useCallback(() => setForm(INITIAL_FORM), []);
  const isValid = form.body.trim().length > 0;
  const advancedTouched = isAdvancedTouched(form);
  const segments = useMemo(() => splitOnSeparator(form.body), [form.body]);

  return {
    form,
    selectedTemplate,
    updateField,
    updateCustomField,
    handleTypeChange,
    resetForm,
    isValid,
    advancedTouched,
    segments,
  };
}

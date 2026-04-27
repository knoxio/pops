/** Sub-hook: form value state, field updaters, type change handler. */
import { useCallback, useMemo, useState } from 'react';

import { INITIAL_FORM } from './types';

import type { IngestFormValues, TemplateSummary } from './types';

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
          scopes: tpl?.default_scopes?.length ? tpl.default_scopes : prev.scopes,
        };
      });
    },
    [templates]
  );

  const resetForm = useCallback(() => setForm(INITIAL_FORM), []);
  const isValid = form.body.trim().length > 0;

  return {
    form,
    selectedTemplate,
    updateField,
    updateCustomField,
    handleTypeChange,
    resetForm,
    isValid,
  };
}

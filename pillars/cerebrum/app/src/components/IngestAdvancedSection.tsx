/**
 * IngestAdvancedSection — collapsible section of the capture surface that
 * exposes type/template/tags/customFields (PRD-081 US-01). Touching any field
 * here flips the form into Advanced mode, routing through cerebrum.ingest.submit.
 */
import { useTranslation } from 'react-i18next';

import { TagPicker } from './TagPicker';
import { TemplateFields } from './TemplateFields';
import { TypeSelector } from './TypeSelector';

import type { useIngestPageModel } from '../pages/ingest-page/useIngestPageModel';

type Model = ReturnType<typeof useIngestPageModel>;

interface IngestAdvancedSectionProps {
  model: Model;
}

export function IngestAdvancedSection({ model }: IngestAdvancedSectionProps) {
  const { t } = useTranslation('cerebrum');
  return (
    <details className="border border-border rounded-md">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-foreground hover:bg-accent/50 rounded-md">
        {t('ingest.advanced')}
      </summary>
      <div className="border-t border-border p-4 space-y-6">
        <TypeSelector
          value={model.form.type}
          options={model.typeOptions}
          loading={model.templatesLoading}
          onChange={model.handleTypeChange}
        />
        {model.selectedTemplate?.custom_fields && (
          <TemplateFields
            fields={model.selectedTemplate.custom_fields}
            values={model.form.customFields}
            onChange={model.updateCustomField}
            requiredFields={model.selectedTemplate.required_fields}
          />
        )}
        <TagPicker
          value={model.form.tags}
          suggestions={model.tagSuggestions}
          loading={model.tagsLoading}
          onChange={(v) => model.updateField('tags', v)}
        />
      </div>
    </details>
  );
}

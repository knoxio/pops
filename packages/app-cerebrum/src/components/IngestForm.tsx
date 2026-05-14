/**
 * IngestForm — capture-first ingest surface (PRD-081 US-01).
 *
 * Primary affordance is a single body editor with optional title and a
 * scope autocomplete. Type/template/tags/customFields are tucked behind an
 * Advanced disclosure. Submitting routes to `quickCapture` unless any
 * Advanced field has been touched, in which case it routes to `submit`.
 */
import { Loader2 } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button, Textarea, TextInput } from '@pops/ui';

import { ScopePicker } from './ScopePicker';
import { SubmitResult } from './SubmitResult';
import { TagPicker } from './TagPicker';
import { TemplateFields } from './TemplateFields';
import { TypeSelector } from './TypeSelector';

import type { useIngestPageModel } from '../pages/ingest-page/useIngestPageModel';

type Model = ReturnType<typeof useIngestPageModel>;

interface IngestFormProps {
  model: Model;
}

function BodyEditor({
  value,
  onChange,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
        {t('ingest.body')}
      </label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('ingest.bodyPlaceholder')}
        rows={8}
        className="min-h-[200px] font-mono text-sm"
        aria-label={t('ingest.body')}
      />
    </div>
  );
}

function getActionLabel(
  t: (key: string) => string,
  isSubmitting: boolean,
  advancedTouched: boolean
): string {
  if (isSubmitting) return t('ingest.submitting');
  if (advancedTouched) return t('ingest.submit');
  return t('ingest.capture');
}

function FormActions({
  isValid,
  isSubmitting,
  advancedTouched,
  onSubmit,
}: {
  isValid: boolean;
  isSubmitting: boolean;
  advancedTouched: boolean;
  onSubmit: () => void;
}) {
  const { t } = useTranslation('cerebrum');
  const label = getActionLabel(t, isSubmitting, advancedTouched);
  return (
    <div className="flex justify-between items-center pt-4">
      <p className="text-xs text-muted-foreground">
        {advancedTouched ? t('ingest.advancedHint') : t('ingest.captureHint')}
      </p>
      <Button
        onClick={onSubmit}
        disabled={!isValid || isSubmitting}
        prefix={isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
      >
        {label}
      </Button>
    </div>
  );
}

function AdvancedSection({ model }: IngestFormProps) {
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

function IngestFormFields({
  model,
  onBodyKeyDown,
}: IngestFormProps & { onBodyKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void }) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="space-y-6">
      <TextInput
        label={t('ingest.title.label')}
        value={model.form.title}
        onChange={(e) => model.updateField('title', e.target.value)}
        placeholder={t('ingest.titlePlaceholder')}
        aria-label={t('ingest.title.label')}
      />
      <BodyEditor
        value={model.form.body}
        onChange={(v) => model.updateField('body', v)}
        onKeyDown={onBodyKeyDown}
      />
      <ScopePicker
        value={model.form.scopes}
        suggestions={model.scopeSuggestions}
        loading={model.scopesLoading}
        onChange={(v) => model.updateField('scopes', v)}
      />
      <AdvancedSection model={model} />
      {model.submitError && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-3">
          {model.submitError}
        </div>
      )}
      <FormActions
        isValid={model.isValid}
        isSubmitting={model.isSubmitting}
        advancedTouched={model.advancedTouched}
        onSubmit={model.handleSubmit}
      />
    </div>
  );
}

function isModifierEnter(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
  return e.key === 'Enter' && (e.metaKey || e.ctrlKey);
}

export function IngestForm({ model }: IngestFormProps) {
  const { t } = useTranslation('cerebrum');

  const handleBodyKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isModifierEnter(e) && model.isValid && !model.isSubmitting) {
        e.preventDefault();
        model.handleSubmit();
        return;
      }
      if (e.key === 'Escape' && model.form.body.length > 0) {
        e.preventDefault();
        // Capture the value BEFORE clearing — otherwise the Undo callback
        // closes over the now-empty form state.
        const cleared = model.form.body;
        model.updateField('body', '');
        toast(t('ingest.cleared'), {
          action: {
            label: t('ingest.undo'),
            onClick: () => model.updateField('body', cleared),
          },
        });
      }
    },
    [model, t]
  );

  if (model.submitResult) {
    return (
      <SubmitResult
        id={model.submitResult.id}
        filePath={model.submitResult.filePath}
        type={model.submitResult.type}
        onReset={model.resetForm}
      />
    );
  }

  return <IngestFormFields model={model} onBodyKeyDown={handleBodyKeyDown} />;
}

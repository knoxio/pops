/**
 * IngestForm — interactive form for creating engrams through the ingestion
 * pipeline. Driven entirely by the view model hook; this component is
 * purely presentational.
 */
import { Loader2 } from 'lucide-react';

import { Button, ChipInput, Select, Textarea, TextInput } from '@pops/ui';

import { ScopeConfirmDialog } from './ScopeConfirmDialog';
import { ScopePicker } from './ScopePicker';
import { SubmitResult } from './SubmitResult';
import { TemplateFields } from './TemplateFields';

import type { useIngestPageModel } from '../pages/ingest-page/useIngestPageModel';

type Model = ReturnType<typeof useIngestPageModel>;

interface IngestFormProps {
  model: Model;
}

function TypeSelector({
  value,
  options,
  loading,
  onChange,
}: {
  value: string;
  options: { value: string; label: string; description: string }[];
  loading: boolean;
  onChange: (v: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm h-11">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading templates…
      </div>
    );
  }

  return (
    <Select
      label="Type"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={options.map((o) => ({ value: o.value, label: o.label }))}
      placeholder="Select type…"
      aria-label="Engram type"
    />
  );
}

function BodyEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
        Body
      </label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Markdown content…"
        rows={8}
        className="min-h-[160px] font-mono text-sm"
        aria-label="Body"
      />
    </div>
  );
}

function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
        Tags
      </label>
      <ChipInput
        value={value}
        onChange={onChange}
        placeholder="Add tags (comma-separated)…"
        aria-label="Tags"
      />
    </div>
  );
}

function getSubmitLabel(isInferring: boolean, isSubmitting: boolean): string {
  if (isInferring) return 'Inferring Scopes…';
  if (isSubmitting) return 'Submitting…';
  return 'Submit';
}

function FormActions({
  isValid,
  isSubmitting,
  isInferring,
  onSubmit,
}: {
  isValid: boolean;
  isSubmitting: boolean;
  isInferring: boolean;
  onSubmit: () => void;
}) {
  const busy = isSubmitting || isInferring;
  return (
    <div className="flex justify-end pt-4">
      <Button
        onClick={onSubmit}
        disabled={!isValid || busy}
        prefix={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
      >
        {getSubmitLabel(isInferring, isSubmitting)}
      </Button>
    </div>
  );
}

function IngestFormFields({ model }: IngestFormProps) {
  return (
    <div className="space-y-6">
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
      <TextInput
        label="Title"
        value={model.form.title}
        onChange={(e) => model.updateField('title', e.target.value)}
        placeholder="Engram title (optional — inferred from body if absent)"
        aria-label="Title"
      />
      <BodyEditor value={model.form.body} onChange={(v) => model.updateField('body', v)} />
      <ScopePicker
        value={model.form.scopes}
        suggestions={model.scopeSuggestions}
        loading={model.scopesLoading}
        onChange={(v) => model.updateField('scopes', v)}
      />
      <TagInput value={model.form.tags} onChange={(v) => model.updateField('tags', v)} />
      {model.submitError && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-3">
          {model.submitError}
        </div>
      )}
      <FormActions
        isValid={model.isValid}
        isSubmitting={model.isSubmitting}
        isInferring={model.isInferring}
        onSubmit={model.handleSubmit}
      />
    </div>
  );
}

export function IngestForm({ model }: IngestFormProps) {
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

  return (
    <>
      <IngestFormFields model={model} />
      <ScopeConfirmDialog
        open={model.showScopeConfirm}
        scopes={model.inferredScopes ?? []}
        onConfirm={model.confirmInferredScopes}
        onDismiss={model.dismissInferredScopes}
      />
    </>
  );
}

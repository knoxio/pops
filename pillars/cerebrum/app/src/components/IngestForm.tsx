/**
 * IngestForm — capture-first ingest surface (PRD-081 US-01 + US-08).
 *
 * Primary affordance is a single body editor with optional title and a
 * scope autocomplete. Type/template/tags/customFields are tucked behind an
 * Advanced disclosure. Submission routes to `quickCapture` (single or bulk)
 * unless any Advanced field has been touched, in which case it routes to
 * `submit`.
 */
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, Textarea, TextInput } from '@pops/ui';

import { BulkResultList } from './BulkResultList';
import { BulkSegmentPreview } from './BulkSegmentPreview';
import { IngestAdvancedSection } from './IngestAdvancedSection';
import { ScopePicker } from './ScopePicker';
import { SubmitResult } from './SubmitResult';
import { useIngestKeyboard } from './useIngestKeyboard';

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
  t: (key: string, opts?: Record<string, unknown>) => string,
  isSubmitting: boolean,
  advancedTouched: boolean,
  segmentCount: number
): string {
  if (isSubmitting) return t('ingest.submitting');
  if (advancedTouched) return t('ingest.submit');
  if (segmentCount > 1) return t('ingest.captureBulk', { count: segmentCount });
  return t('ingest.capture');
}

function getActionHint(
  t: (key: string) => string,
  advancedTouched: boolean,
  segmentCount: number
): string {
  if (advancedTouched) return t('ingest.advancedHint');
  if (segmentCount > 1) return t('ingest.bulkHint');
  return t('ingest.captureHint');
}

function FormActions({
  isValid,
  isSubmitting,
  advancedTouched,
  segmentCount,
  onSubmit,
}: {
  isValid: boolean;
  isSubmitting: boolean;
  advancedTouched: boolean;
  segmentCount: number;
  onSubmit: () => void;
}) {
  const { t } = useTranslation('cerebrum');
  const label = getActionLabel(t, isSubmitting, advancedTouched, segmentCount);
  const hint = getActionHint(t, advancedTouched, segmentCount);
  return (
    <div className="flex justify-between items-center pt-4">
      <p className="text-xs text-muted-foreground">{hint}</p>
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
      <IngestAdvancedSection model={model} />
      {!model.advancedTouched && <BulkSegmentPreview segments={model.segments} />}
      {model.submitError && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-3">
          {model.submitError}
        </div>
      )}
      <FormActions
        isValid={model.isValid}
        isSubmitting={model.isSubmitting}
        advancedTouched={model.advancedTouched}
        segmentCount={model.advancedTouched ? 1 : model.segments.length}
        onSubmit={() => model.handleSubmit()}
      />
    </div>
  );
}

export function IngestForm({ model }: IngestFormProps) {
  const onBodyKeyDown = useIngestKeyboard({
    body: model.form.body,
    isValid: model.isValid,
    isSubmitting: model.isSubmitting,
    handleSubmit: model.handleSubmit,
    setBody: (value) => model.updateField('body', value),
  });

  if (model.bulkResults) {
    return (
      <BulkResultList
        results={model.bulkResults}
        isSubmitting={model.isSubmitting}
        onRetry={model.retrySegment}
        onReset={model.resetForm}
      />
    );
  }

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

  return <IngestFormFields model={model} onBodyKeyDown={onBodyKeyDown} />;
}

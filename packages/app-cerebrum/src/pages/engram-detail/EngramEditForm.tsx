/**
 * EngramEditForm — inline form for editing an engram's frontmatter +
 * body. Driven entirely by the parent `useEngramDetailModel`; this
 * component is purely presentational so the test surface stays clean.
 */
import { useTranslation } from 'react-i18next';

import { Button, ChipInput, Textarea, TextInput } from '@pops/ui';

import { ENGRAM_STATUSES, type EngramStatus } from '../../engrams/types';

import type { useEngramDetailModel } from '../../engrams/useEngramDetailModel';

const TOUCH_TARGET_MIN_HEIGHT = 'min-h-[44px]';

type Model = ReturnType<typeof useEngramDetailModel>;

function StatusSelect({
  value,
  onChange,
  label,
}: {
  value: EngramStatus;
  onChange: (next: EngramStatus) => void;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        aria-label={label}
        className={`rounded-md border border-border bg-background px-2 text-sm ${TOUCH_TARGET_MIN_HEIGHT}`}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as EngramStatus)}
      >
        {ENGRAM_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChipField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <ChipInput value={values} onChange={onChange} placeholder={label} aria-label={label} />
    </div>
  );
}

function FormErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul className="text-xs text-destructive list-disc pl-4" data-testid="engram-edit-errors">
      {errors.map((err) => (
        <li key={err}>{err}</li>
      ))}
    </ul>
  );
}

function BodyField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { t } = useTranslation('cerebrum');
  return (
    <div>
      <label className="text-xs text-muted-foreground" htmlFor="engram-edit-body">
        {t('engrams.edit.body')}
      </label>
      <Textarea
        id="engram-edit-body"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        rows={20}
        className="font-mono text-sm"
        aria-label={t('engrams.edit.body')}
      />
      <p className="mt-1 text-xs text-muted-foreground">{t('engrams.edit.autosaveHint')}</p>
    </div>
  );
}

function FormActions({
  isSaving,
  saveDisabled,
  onCancel,
}: {
  isSaving: boolean;
  saveDisabled: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="flex items-center gap-2">
      <Button type="submit" disabled={saveDisabled} className={TOUCH_TARGET_MIN_HEIGHT}>
        {isSaving ? t('engrams.edit.saving') : t('engrams.edit.save')}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        className={TOUCH_TARGET_MIN_HEIGHT}
      >
        {t('engrams.detail.cancel')}
      </Button>
    </div>
  );
}

export function EngramEditForm({ model }: { model: Model }) {
  const { t } = useTranslation('cerebrum');
  const { form, updateForm, validationErrors, isSaving, saveError } = model;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        model.save();
      }}
    >
      <TextInput
        label={t('engrams.edit.title')}
        aria-label={t('engrams.edit.title')}
        value={form.title}
        onChange={(e) => updateForm({ title: e.currentTarget.value })}
      />
      <ChipField
        label={t('engrams.edit.scopes')}
        values={form.scopes}
        onChange={(scopes) => updateForm({ scopes })}
      />
      <ChipField
        label={t('engrams.edit.tags')}
        values={form.tags}
        onChange={(tags) => updateForm({ tags })}
      />
      <StatusSelect
        value={form.status}
        onChange={(status) => updateForm({ status })}
        label={t('engrams.edit.status')}
      />
      <BodyField value={form.body} onChange={(body) => updateForm({ body })} />
      <FormErrors errors={validationErrors} />
      {saveError && <p className="text-xs text-destructive">{saveError.message}</p>}
      <FormActions
        isSaving={isSaving}
        saveDisabled={isSaving || validationErrors.length > 0}
        onCancel={() => model.cancelEdit()}
      />
    </form>
  );
}

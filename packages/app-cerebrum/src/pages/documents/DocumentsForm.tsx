import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { TOUCH_TARGET_MIN_HEIGHT } from '../../utils/touchTarget';
import { DateRangeFields, FilterFields, ModeField, QueryField } from './DocumentsFormFields';

import type { DocumentsFormState } from '../../documents/types';

interface DocumentsFormProps {
  form: DocumentsFormState;
  setForm: (next: DocumentsFormState) => void;
  isGenerating: boolean;
  isPreviewing: boolean;
  hasGenerated: boolean;
  onPreview: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
}

function Actions({
  isGenerating,
  isPreviewing,
  hasGenerated,
  onPreview,
  onGenerate,
  onRegenerate,
}: Omit<DocumentsFormProps, 'form' | 'setForm'>) {
  const { t } = useTranslation('cerebrum');
  const disabled = isPreviewing || isGenerating;
  return (
    <div className="flex gap-2 pt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className={TOUCH_TARGET_MIN_HEIGHT}
        onClick={onPreview}
      >
        {t('documents.form.preview')}
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        className={TOUCH_TARGET_MIN_HEIGHT}
        onClick={onGenerate}
      >
        {isGenerating ? t('documents.form.generating') : t('documents.form.generate')}
      </Button>
      {hasGenerated ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={TOUCH_TARGET_MIN_HEIGHT}
          onClick={onRegenerate}
        >
          {t('documents.form.regenerate')}
        </Button>
      ) : null}
    </div>
  );
}

export function DocumentsForm(props: DocumentsFormProps) {
  const { form, setForm, ...actionProps } = props;
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <ModeField form={form} setForm={setForm} />
      <QueryField form={form} setForm={setForm} />
      <DateRangeFields form={form} setForm={setForm} />
      <FilterFields form={form} setForm={setForm} />
      <Actions {...actionProps} />
    </section>
  );
}

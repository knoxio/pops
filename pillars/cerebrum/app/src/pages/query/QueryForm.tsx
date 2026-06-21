/**
 * QueryForm — input for the natural-language question plus the
 * scope / domain / secret filters (PRD-082). Mirrors the field-level
 * primitives used by the Documents form so cerebrum surfaces feel
 * consistent.
 */
import { useTranslation } from 'react-i18next';

import { Button, Checkbox, Input, Label } from '@pops/ui';

import { QUERY_DOMAINS, type QueryDomain, type QueryFormState } from '../../query/types';
import { TOUCH_TARGET_MIN_HEIGHT } from '../../utils/touchTarget';

interface QueryFormProps {
  form: QueryFormState;
  setForm: (next: QueryFormState) => void;
  isAsking: boolean;
  onAsk: () => void;
}

function QuestionField({ form, setForm }: Pick<QueryFormProps, 'form' | 'setForm'>) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="query-question">{t('query.form.question')}</Label>
      <Input
        id="query-question"
        className={TOUCH_TARGET_MIN_HEIGHT}
        value={form.question}
        placeholder={t('query.form.questionPlaceholder')}
        onChange={(e) => setForm({ ...form, question: e.currentTarget.value })}
      />
    </div>
  );
}

function ScopeField({ form, setForm }: Pick<QueryFormProps, 'form' | 'setForm'>) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="query-scopes">{t('query.form.scopes')}</Label>
      <Input
        id="query-scopes"
        className={TOUCH_TARGET_MIN_HEIGHT}
        value={form.scopes}
        placeholder={t('query.form.scopesPlaceholder')}
        onChange={(e) => setForm({ ...form, scopes: e.currentTarget.value })}
      />
    </div>
  );
}

function DomainCheckboxes({ form, setForm }: Pick<QueryFormProps, 'form' | 'setForm'>) {
  const { t } = useTranslation('cerebrum');
  const toggle = (domain: QueryDomain, next: boolean) => {
    const filtered = form.domains.filter((d) => d !== domain);
    setForm({ ...form, domains: next ? [...filtered, domain] : filtered });
  };
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium leading-none">{t('query.form.domains')}</legend>
      <div className="flex flex-wrap gap-3 pt-1">
        {QUERY_DOMAINS.map((domain) => (
          <label key={domain} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.domains.includes(domain)}
              onCheckedChange={(next) => toggle(domain, next === true)}
              aria-label={t(`query.domains.${domain}`)}
            />
            {t(`query.domains.${domain}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SecretToggle({ form, setForm }: Pick<QueryFormProps, 'form' | 'setForm'>) {
  const { t } = useTranslation('cerebrum');
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={form.includeSecret}
        onCheckedChange={(next) => setForm({ ...form, includeSecret: next === true })}
        aria-label={t('query.form.includeSecret')}
      />
      {t('query.form.includeSecret')}
    </label>
  );
}

export function QueryForm({ form, setForm, isAsking, onAsk }: QueryFormProps) {
  const { t } = useTranslation('cerebrum');
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <QuestionField form={form} setForm={setForm} />
      <ScopeField form={form} setForm={setForm} />
      <DomainCheckboxes form={form} setForm={setForm} />
      <SecretToggle form={form} setForm={setForm} />
      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          size="sm"
          disabled={isAsking}
          className={TOUCH_TARGET_MIN_HEIGHT}
          onClick={onAsk}
          data-testid="query-ask"
        >
          {isAsking ? t('query.form.asking') : t('query.form.ask')}
        </Button>
      </div>
    </section>
  );
}

/**
 * PRD-133 — Read-only viewer for the food AI prompt templates.
 *
 * Mirrors `@pops/app-finance`'s PromptViewerPage. Renders one card per
 * entry in `FOOD_PROMPTS`. Operator-facing surface — useful when
 * iterating on ingest quality without opening the repo.
 *
 * To edit a prompt: change the constant in
 * `pillars/food/app/src/prompts/`, bump its version string, deploy.
 */
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import { FOOD_PROMPTS } from '../ai/prompt-registry';

export function PromptViewerPage() {
  const { t } = useTranslation('food');

  return (
    <div className="space-y-6 max-w-3xl p-6">
      <PageHeader title={t('prompts.title')} description={t('prompts.description')} />

      <p className="text-sm text-muted-foreground">{t('prompts.editingHint')}</p>

      <div className="space-y-8">
        {FOOD_PROMPTS.map((prompt) => (
          <article
            key={prompt.id}
            className="border rounded-lg overflow-hidden"
            aria-labelledby={`prompt-${prompt.id}-title`}
          >
            <header className="px-4 py-3 bg-muted/30 border-b">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id={`prompt-${prompt.id}-title`} className="font-semibold">
                  {prompt.title}
                </h2>
                <span className="text-xs text-muted-foreground font-mono">{prompt.prd}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{prompt.description}</p>
              <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
                <div className="flex items-center gap-2">
                  <dt className="font-medium text-muted-foreground">{t('prompts.fields.model')}</dt>
                  <dd>
                    <code className="bg-muted px-2 py-0.5 rounded font-mono">{prompt.model}</code>
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="font-medium text-muted-foreground">
                    {t('prompts.fields.version')}
                  </dt>
                  <dd>
                    <code className="bg-muted px-2 py-0.5 rounded font-mono">{prompt.version}</code>
                  </dd>
                </div>
              </dl>
            </header>
            <pre className="p-4 text-sm font-mono whitespace-pre-wrap bg-muted/10 overflow-x-auto">
              {prompt.template}
            </pre>
          </article>
        ))}
      </div>
    </div>
  );
}

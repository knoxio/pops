/**
 * Preview body of the FromPlanPage — section list + skipped caption +
 * empty / loading / error states.
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { FromPlanSection } from './FromPlanSection.js';
import { translateSectionLabel } from './section-label.js';

import type { GeneratorPreview } from './types.js';

interface FromPlanPreviewProps {
  preview: GeneratorPreview | undefined;
  isLoading: boolean;
  errorMessage: string | null;
}

export function FromPlanPreview({
  preview,
  isLoading,
  errorMessage,
}: FromPlanPreviewProps): ReactElement {
  const { t } = useTranslation('food');
  if (errorMessage !== null) {
    return (
      <div className="text-sm text-rose-600" role="alert" data-testid="preview-error">
        {errorMessage}
      </div>
    );
  }
  if (isLoading || preview === undefined) {
    return (
      <div className="text-sm text-muted-foreground" data-testid="preview-loading">
        …
      </div>
    );
  }
  const totalItems = preview.sections.reduce((acc, s) => acc + s.items.length, 0);
  if (totalItems === 0) {
    return (
      <div className="text-sm text-muted-foreground" data-testid="preview-empty">
        {t('shopping.fromPlan.empty')}
      </div>
    );
  }
  const uncategorisedIds = new Set(preview.uncategorisedIngredientIds);
  return (
    <section data-testid="from-plan-preview" className="space-y-1">
      <h2 className="text-sm font-medium">
        {t('shopping.fromPlan.previewHeader', {
          count: totalItems,
          sectionCount: preview.sections.length,
        })}
      </h2>
      {preview.skippedPlanEntryCount > 0 && (
        <div className="text-xs text-muted-foreground" data-testid="skipped-caption">
          {t('shopping.fromPlan.skippedCaption', { count: preview.skippedPlanEntryCount })}
        </div>
      )}
      {preview.sections.map((section) => (
        <FromPlanSection
          key={section.sectionLabel}
          section={section}
          label={translateSectionLabel(t, section.sectionLabel)}
          uncategorisedIds={uncategorisedIds}
        />
      ))}
    </section>
  );
}

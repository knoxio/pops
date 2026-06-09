/**
 * Preview pane for the send-to-list modal — PRD-142.
 *
 * Shows the canonical items (post-aggregation, post-scale) and the
 * unconverted items in two grouped lists with a `…N more` collapser that
 * expands inline. PRD §UI shows first 5 + "…N more"; using 6 here keeps
 * the section readable on tall recipes without an immediate cutoff.
 */
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { PrepareOutput } from './useSendToListData.js';

const COLLAPSE_THRESHOLD = 6;

interface Props {
  preview: PrepareOutput;
}

export function SendToListPreview({ preview }: Props): ReactElement {
  const { t } = useTranslation('food');
  const totalCount = preview.canonicalItems.length + preview.unconvertedItems.length;
  if (totalCount === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('recipes.detail.sendToList.preview.empty')}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <Section
        titleKey="recipes.detail.sendToList.preview.canonical"
        items={preview.canonicalItems.map((it) => it.label)}
      />
      <Section
        titleKey="recipes.detail.sendToList.preview.unconverted"
        items={preview.unconvertedItems.map((it) => it.label)}
        emptyOK
      />
    </div>
  );
}

interface SectionProps {
  titleKey: string;
  items: readonly string[];
  emptyOK?: boolean;
}

function Section({ titleKey, items, emptyOK }: SectionProps): ReactElement | null {
  const { t } = useTranslation('food');
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) {
    if (emptyOK === true) return null;
    return (
      <div>
        <h4 className="text-sm font-medium">{t(titleKey, { count: 0 })}</h4>
      </div>
    );
  }
  const visible = expanded ? items : items.slice(0, COLLAPSE_THRESHOLD);
  const overflow = items.length - visible.length;
  return (
    <div>
      <h4 className="text-sm font-medium">{t(titleKey, { count: items.length })}</h4>
      <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
        {visible.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
      {overflow > 0 && (
        <button type="button" className="mt-1 text-xs underline" onClick={() => setExpanded(true)}>
          {t('recipes.detail.sendToList.preview.expand', { count: overflow })}
        </button>
      )}
    </div>
  );
}

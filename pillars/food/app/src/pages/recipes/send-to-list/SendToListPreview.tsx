/**
 * Preview pane for the send-to-list modal
 * (pillars/food/docs/prds/send-to-list).
 *
 * Shows canonical items (post-aggregation, post-scale) and unconverted items
 * in two grouped lists with a `…N more` collapser that expands inline. The
 * collapse threshold sits one above the spec's "first 5" to keep tall
 * recipes readable without an immediate cutoff.
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
        items={preview.canonicalItems.map(toRow)}
      />
      <Section
        titleKey="recipes.detail.sendToList.preview.unconverted"
        items={preview.unconvertedItems.map(toRow)}
        emptyOK
      />
    </div>
  );
}

interface Row {
  key: string;
  label: string;
}

function toRow(item: PrepareOutput['canonicalItems'][number]): Row {
  // First sourceLineId is unique per preview row and stable across renders:
  // canonical items aggregate multiple lines but the first id is stable,
  // unconverted items have exactly one line id. Label-as-key collides on
  // identical text, so it's only the fallback when no line id exists.
  return { key: String(item.sourceLineIds[0] ?? item.label), label: item.label };
}

interface SectionProps {
  titleKey: string;
  items: readonly Row[];
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
        {visible.map((row) => (
          <li key={row.key}>{row.label}</li>
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

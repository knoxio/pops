/**
 * A `<details>`-based collapsible section in the shopping preview.
 */
import { type ReactElement } from 'react';

import { FromPlanItem } from './FromPlanItem.js';

import type { GeneratorSection } from './types.js';

interface FromPlanSectionProps {
  section: GeneratorSection;
  /** Section header label (already translated by parent). */
  label: string;
  /** ingredientIds in the "Other" bucket; only rows in this set show the Tag-it link. */
  uncategorisedIds: ReadonlySet<number>;
  defaultOpen?: boolean;
}

export function FromPlanSection({
  section,
  label,
  uncategorisedIds,
  defaultOpen = true,
}: FromPlanSectionProps): ReactElement {
  return (
    <details
      open={defaultOpen}
      data-testid="from-plan-section"
      data-section-tag={section.sectionTag ?? ''}
      className="border rounded mb-3"
    >
      <summary className="cursor-pointer px-3 py-2 bg-slate-50 dark:bg-slate-900 font-medium select-none">
        {label} <span className="text-muted-foreground">({section.items.length})</span>
      </summary>
      <ul className="px-3 pb-2 divide-y divide-slate-100 dark:divide-slate-800">
        {section.items.map((item) => (
          <FromPlanItem
            key={`${String(item.ingredientId)}-${String(item.variantId ?? 0)}-${item.canonicalUnit}`}
            item={item}
            showTagItLink={uncategorisedIds.has(item.ingredientId) && !item.isUnconverted}
          />
        ))}
      </ul>
    </details>
  );
}

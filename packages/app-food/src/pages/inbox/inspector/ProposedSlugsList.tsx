/**
 * PRD-135 — proposed-slug list with cursor-move.
 *
 * Clicking an entry calls back into the parent with the `fromLoc` so the
 * decision pane can bump the editor's `pendingCursor` prop and move the
 * cursor to the source span (PRD-120's imperative cursor target).
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { InspectorProposedSlugRow } from './inspector-wire-types.js';

interface Props {
  proposedSlugs: readonly InspectorProposedSlugRow[];
  onPickSlug: (row: InspectorProposedSlugRow) => void;
}

export function ProposedSlugsList({ proposedSlugs, onPickSlug }: Props): ReactElement | null {
  const { t } = useTranslation('food');
  if (proposedSlugs.length === 0) return null;
  return (
    <section className="space-y-1" data-testid="inspector-proposed-slugs">
      <header className="text-sm font-medium">
        {t('inbox.inspector.decision.proposedSlugs.heading', { count: proposedSlugs.length })}
      </header>
      <ul className="space-y-1">
        {proposedSlugs.map((row) => (
          <li key={`${row.slug}:${row.fromLoc.startLine}:${row.fromLoc.startCol}`}>
            <button
              type="button"
              onClick={() => onPickSlug(row)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
              data-testid={`inspector-proposed-slug-${row.slug}`}
            >
              <span>{row.slug}</span>
              <span className="text-xs text-muted-foreground">
                {t('inbox.inspector.decision.proposedSlugs.location', {
                  line: row.fromLoc.startLine,
                  col: row.fromLoc.startCol,
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

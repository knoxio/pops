import { useTranslation } from 'react-i18next';

import type { ListKind } from './types.js';

/**
 * Inline chip used in the detail header (and reused by the index card in
 * future 140-B). Stays plain HTML on purpose — see ListsLandingPage header
 * comment for the rationale behind keeping `app-lists` free of `@pops/ui`.
 */
const KIND_COLOURS: Record<ListKind, string> = {
  shopping: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100',
  packing: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  todo: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
  generic: 'bg-slate-200 text-slate-900 dark:bg-slate-700/60 dark:text-slate-100',
};

export function ListKindChip({ kind }: { kind: ListKind }) {
  const { t } = useTranslation('lists');
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${KIND_COLOURS[kind]}`}
      data-testid="list-kind-chip"
    >
      {t(`detail.kind.${kind}`)}
    </span>
  );
}

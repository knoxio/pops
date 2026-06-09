import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

import type { ReactElement } from 'react';

import type { ListKind } from './list-index-types.js';

const KIND_VARIANT: Record<ListKind, 'default' | 'secondary' | 'outline'> = {
  shopping: 'default',
  packing: 'secondary',
  todo: 'secondary',
  generic: 'outline',
};

interface Props {
  kind: ListKind;
}

/**
 * Single-source chip for a list's `kind`. Used by `ListRow` (compact) and
 * future detail-page headers; keeping the variant + label resolution in one
 * place avoids drift if PRD-140 part C reuses it.
 */
export function ListKindChip({ kind }: Props): ReactElement {
  const { t } = useTranslation('lists');
  return (
    <Badge variant={KIND_VARIANT[kind]} data-kind={kind}>
      {t(`index.kinds.${kind}`)}
    </Badge>
  );
}

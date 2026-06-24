import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { Button, DropdownMenu } from '@pops/ui';

import type { ReactNode } from 'react';

/**
 * Item shape mirrored from `@pops/ui`'s wrapper component. We can't
 * re-import its `DropdownMenuItem` interface name because the same
 * identifier is also re-exported as the underlying Radix component, so
 * a `type` import collapses to the value.
 */
export interface RecipeActionMenuItem {
  label: string;
  value: string;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  onSelect?: () => void;
}

interface Props {
  slug: string;
  draftCount: number;
  onArchive: () => void;
  /** Items injected at the slot between Drafts and Archive (Cook now, Send to list). */
  extraItems?: RecipeActionMenuItem[];
}

/**
 * Top-right action menu on the recipe detail page. Canonical order:
 *   Edit / Drafts / Cook now... / Send to shopping list... / Archive.
 * Edit / Drafts / Archive are fixed here; the Cook now and Send-to-list
 * entries arrive through the `extraItems` slot between Drafts and Archive.
 *
 * Built on `@pops/ui`'s Radix-backed `DropdownMenu` so we get focus
 * trap, roving focus, typeahead, click-outside, and Escape-to-close for
 * free.
 */
export function RecipeActionMenu({ slug, draftCount, onArchive, extraItems }: Props): ReactNode {
  const { t } = useTranslation('food');
  const navigate = useNavigate();
  const items: RecipeActionMenuItem[] = [
    {
      label: t('recipes.detail.actions.edit'),
      value: 'edit',
      onSelect: () => {
        void navigate(`/food/recipes/${slug}/edit`);
      },
    },
    {
      label: t('recipes.detail.actions.drafts', { count: draftCount }),
      value: 'drafts',
      onSelect: () => {
        void navigate(`/food/recipes/${slug}/drafts`);
      },
    },
    ...(extraItems ?? []),
    {
      label: t('recipes.detail.actions.archive'),
      value: 'archive',
      variant: 'destructive',
      onSelect: onArchive,
    },
  ];
  return (
    <DropdownMenu
      align="end"
      trigger={<Button variant="outline">{t('recipes.detail.actions.button')}</Button>}
      items={items}
    />
  );
}

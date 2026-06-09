import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

interface Props {
  slug: string;
  draftCount: number;
  onArchive: () => void;
  /** PRD-142 + PRD-144 will inject their own menu items via this slot. */
  extraItems?: ReactElement | null;
}

/**
 * Top-right action menu on the recipe detail page. Canonical final order
 * (per roadmap line 489):
 *   Edit / Drafts / Cook now... / Send to shopping list... / Archive.
 * 119-B ships only Edit / Drafts / Archive — PRD-142 and PRD-144 plug
 * into the `extraItems` slot to add their own entries between Drafts and
 * Archive when those PRDs land.
 */
export function RecipeActionMenu({
  slug,
  draftCount,
  onArchive,
  extraItems = null,
}: Props): ReactElement {
  const { t } = useTranslation('food');
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {t('recipes.detail.actions.button')}
      </Button>
      {open && (
        <div
          role="menu"
          tabIndex={-1}
          className="absolute right-0 z-10 mt-1 w-56 rounded-md border bg-popover p-1 shadow-md"
          onMouseLeave={() => setOpen(false)}
        >
          <MenuLink to={`/food/recipes/${slug}/edit`} label={t('recipes.detail.actions.edit')} />
          <MenuLink
            to={`/food/recipes/${slug}/drafts`}
            label={t('recipes.detail.actions.drafts', { count: draftCount })}
          />
          {extraItems}
          <MenuButton onClick={onArchive} label={t('recipes.detail.actions.archive')} />
        </div>
      )}
    </div>
  );
}

function MenuLink({ to, label }: { to: string; label: string }): ReactElement {
  return (
    <Link to={to} role="menuitem" className="block rounded px-3 py-1.5 text-sm hover:bg-accent">
      {label}
    </Link>
  );
}

function MenuButton({ onClick, label }: { onClick: () => void; label: string }): ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full rounded px-3 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
    >
      {label}
    </button>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMenuKeyboard } from './useMenuKeyboard.js';

/**
 * Three-dot menu surfaced per item row: Edit / Move up / Move down / Delete.
 * Move up/down are also accessible via drag, but the menu is the keyboard +
 * mobile-fallback path (PRD-140 line 95). Keyboard model matches
 * `useMenuKeyboard` (arrow/Home/End across enabled items, first-item focus
 * on open).
 */
export interface ListItemMenuProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export function ListItemMenu(props: ListItemMenuProps) {
  const { t } = useTranslation('lists');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { menuRef, onMenuKeyDown } = useMenuKeyboard(open);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('detail.item.menu.label')}
      >
        ⋮
      </button>
      {open ? (
        <ul
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-10 mt-1 min-w-40 rounded-md border bg-popover p-1 shadow-md"
        >
          <Item onClick={run(props.onEdit)}>{t('detail.item.menu.edit')}</Item>
          <Item onClick={run(props.onMoveUp)} disabled={!props.canMoveUp}>
            {t('detail.item.menu.moveUp')}
          </Item>
          <Item onClick={run(props.onMoveDown)} disabled={!props.canMoveDown}>
            {t('detail.item.menu.moveDown')}
          </Item>
          <Item onClick={run(props.onDelete)} destructive>
            {t('detail.item.menu.delete')}
          </Item>
        </ul>
      ) : null}
    </div>
  );
}

function Item({
  children,
  onClick,
  destructive = false,
  disabled = false,
}: {
  children: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        disabled={disabled}
        className={`block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus:bg-muted focus:outline-none ${
          destructive ? 'text-destructive' : ''
        }`}
      >
        {children}
      </button>
    </li>
  );
}

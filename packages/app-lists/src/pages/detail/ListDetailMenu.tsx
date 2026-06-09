import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMenuKeyboard } from './useMenuKeyboard.js';

/**
 * Three-dot action menu shown in the detail header. Plain HTML + Tailwind so
 * the package stays free of `@pops/ui` (same constraint as
 * ListsLandingPage). Closes on outside click + Escape; focus lands on the
 * first item when the menu opens; ArrowUp/ArrowDown/Home/End cycle through
 * items per the ARIA menu keyboard model (see `useMenuKeyboard`).
 */
export interface ListDetailMenuProps {
  isArchived: boolean;
  onRename: () => void;
  onChangeKind: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

export function ListDetailMenu(props: ListDetailMenuProps) {
  const { t } = useTranslation('lists');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { menuRef, onMenuKeyDown } = useMenuKeyboard(open);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
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
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-lg hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('detail.menu.label')}
      >
        ⋮
      </button>
      {open ? (
        <ul
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-10 mt-1 min-w-44 rounded-md border bg-popover p-1 shadow-md"
        >
          <MenuItem onClick={run(props.onRename)}>{t('detail.menu.rename')}</MenuItem>
          <MenuItem onClick={run(props.onChangeKind)}>{t('detail.menu.changeKind')}</MenuItem>
          <MenuItem onClick={run(props.onArchiveToggle)}>
            {props.isArchived ? t('detail.menu.restore') : t('detail.menu.archive')}
          </MenuItem>
          <MenuItem onClick={run(props.onDelete)} destructive>
            {t('detail.menu.delete')}
          </MenuItem>
        </ul>
      ) : null}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  destructive = false,
}: {
  children: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className={`block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none ${
          destructive ? 'text-destructive' : ''
        }`}
      >
        {children}
      </button>
    </li>
  );
}

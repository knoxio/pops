import { useTranslation } from 'react-i18next';

import { SHOPPING_SORT_MODES, type ShoppingSortMode } from './types.js';

/**
 * Native `<select>` for the sort mode. Native is deliberate: zero deps +
 * mobile OS picker UI + collapsing to an icon-only trigger when the
 * container is narrow is a CSS concern, not a JS one.
 */
export interface ShoppingSortDropdownProps {
  mode: ShoppingSortMode;
  onChange: (mode: ShoppingSortMode) => void;
  /**
   * When true (mobile), the label is hidden visually but kept on a
   * `sr-only` span so screen readers still announce the control.
   */
  compact?: boolean;
}

export function ShoppingSortDropdown(props: ShoppingSortDropdownProps) {
  const { t } = useTranslation('lists');
  const labelText = t('shopping.header.sort.label');

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className={props.compact === true ? 'sr-only' : 'text-muted-foreground'}>
        {labelText}
      </span>
      <select
        value={props.mode}
        onChange={(e) => props.onChange(e.target.value as ShoppingSortMode)}
        className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label={labelText}
        data-testid="shopping-sort-dropdown"
      >
        {SHOPPING_SORT_MODES.map((value) => (
          <option key={value} value={value}>
            {t(`shopping.header.sort.options.${value}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

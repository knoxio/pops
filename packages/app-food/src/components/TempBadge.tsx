import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

/**
 * `@temperature(...)` rendered as a small badge inside step bodies — PRD-121.
 *
 * Renders the unit symbol per AC line 221:
 *   `:c`   → `180 °C`
 *   `:f`   → `350 °F`
 *   `:gas` → `Gas 5`
 *
 * Cosmetic only — no click behaviour, no callback. Step-level temperature
 * (PRD-116's hoist column) renders the same way as inline `@temperature`;
 * the renderer reuses this component for both.
 */
export interface TempBadgeProps {
  /** Numeric value. */
  value: number;
  /** Normalised PRD-116 unit. */
  unit: 'c' | 'f' | 'gas';
}

function formatTemperatureLabel(value: number, unit: 'c' | 'f' | 'gas'): string {
  if (unit === 'gas') return `Gas ${value}`;
  const symbol = unit === 'c' ? '°C' : '°F';
  return `${value} ${symbol}`;
}

function unitDisplayName(unit: 'c' | 'f' | 'gas'): string {
  if (unit === 'c') return 'Celsius';
  if (unit === 'f') return 'Fahrenheit';
  return 'Gas';
}

export function TempBadge({ value, unit }: TempBadgeProps) {
  const { t } = useTranslation('food');

  const label = formatTemperatureLabel(value, unit);
  // Aria label spells out the unit name for screen readers; visible label
  // uses the symbolic form.
  const unitName = unitDisplayName(unit);
  const ariaLabel = t('renderer.tempAria', { value, unit: unitName });

  return (
    <Badge variant="outline" aria-label={ariaLabel} data-testid="temp-badge" data-unit={unit}>
      {label}
    </Badge>
  );
}

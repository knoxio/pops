import { Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@pops/ui';

/**
 * `@time(...)` rendered as a tappable button. Fire-and-forget — clicking
 * emits `onTimerStart(durationMinutes, stepPosition)` but the button itself
 * owns no state. `unit` is the original DSL unit (display); the callback
 * always receives normalised minutes.
 */
export interface TimerButtonProps {
  /** Original quantity from the DSL — `[2 min]` shows "2 min". */
  qty: number;
  /** Original unit from the DSL — `min`, `h`, `hr`, `hour`, `s`, `sec`. */
  unit: string;
  /** Normalised duration in minutes. */
  durationMinutes: number;
  /** Step position the timer belongs to — passed back to the callback. */
  stepPosition: number;
  /** Optional click callback — fire-and-forget. */
  onStart?: (durationMinutes: number, stepPosition: number) => void;
}

const baseClasses =
  'inline-flex items-center gap-1 rounded-md border border-input bg-background ' +
  'px-2 py-0.5 text-xs font-medium text-foreground transition-colors ' +
  'hover:bg-accent hover:text-accent-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function TimerButton({
  qty,
  unit,
  durationMinutes,
  stepPosition,
  onStart,
}: TimerButtonProps) {
  const { t } = useTranslation('food');

  const ariaLabel = t('renderer.timerAria', { count: qty, unit });

  return (
    <button
      type="button"
      className={cn(baseClasses)}
      onClick={() => onStart?.(durationMinutes, stepPosition)}
      aria-label={ariaLabel}
      data-testid="timer-button"
      data-duration-minutes={durationMinutes}
      data-step-position={stepPosition}
    >
      <Play className="h-3 w-3" aria-hidden="true" />
      <span>
        {qty} {unit}
      </span>
    </button>
  );
}

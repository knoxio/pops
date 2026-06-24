/**
 * Shared touch-target class. The 44px floor mirrors the iOS HIG
 * accessibility guideline. `min-h-11` (2.75rem) hits that floor via the
 * standard Tailwind spacing scale, avoiding the no-arbitrary-values rule.
 */
export const TOUCH_TARGET_MIN_HEIGHT = 'min-h-11';

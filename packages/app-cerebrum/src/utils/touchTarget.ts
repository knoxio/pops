/**
 * Shared touch-target class. The 44px floor mirrors the iOS HIG
 * accessibility guideline; we used to hand-roll an arbitrary value
 * (`min-h-[44px]`) in every page, which both duplicated the literal
 * and tripped the no-arbitrary-values Tailwind rule. `min-h-11` maps
 * to the same 2.75rem (44px) via the standard spacing scale.
 */
export const TOUCH_TARGET_MIN_HEIGHT = 'min-h-11';

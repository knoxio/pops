/**
 * Typed settings key registry — shared between backend and frontend.
 *
 * This is a subset of settings keys needed by frontend packages.
 * The canonical source is apps/pops-api/src/modules/core/settings/keys.ts.
 */
export const SETTINGS_KEYS = {
  // AI
  AI_MODEL: 'ai.model',
  AI_MONTHLY_TOKEN_BUDGET: 'ai.monthlyTokenBudget',
  AI_BUDGET_EXCEEDED_FALLBACK: 'ai.budgetExceededFallback',

  // App
  THEME: 'theme',
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

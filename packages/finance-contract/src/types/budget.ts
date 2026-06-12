export const BUDGET_PERIODS = ['monthly', 'yearly'] as const;

export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

/**
 * A budget cap scoped to a category and period. Mirrors the API response
 * (camelCase) for the finance pillar.
 *
 * Contract shape is narrower than the current persistence row: the
 * legacy `amount` field is renamed to `cap`, and the free-form
 * `category` string is replaced by a stable `categoryId` reference.
 * The runtime API today emits the legacy fields; this contract pins the
 * intended shape downstream consumers should code against.
 */
export interface Budget {
  id: string;
  name: string;
  /** Spend ceiling for the period. Always non-negative. */
  cap: number;
  period: BudgetPeriod;
  categoryId: string | null;
  /** ISO-8601 timestamp. Validated by `BudgetSchema` via `.datetime()`. */
  lastEditedTime: string;
}

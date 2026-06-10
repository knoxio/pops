/**
 * Internal error class for `prepareCook`. Lives in its own file so the
 * loaders module can import it without a circular dep on `prepare.ts`.
 */
export class PrepareCookError extends Error {
  readonly reason: 'RecipeVersionNotFound' | 'PlanEntryNotFound';
  constructor(reason: 'RecipeVersionNotFound' | 'PlanEntryNotFound') {
    super(reason);
    this.name = 'PrepareCookError';
    this.reason = reason;
  }
}

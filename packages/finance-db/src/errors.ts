/**
 * Typed errors raised by the finance domain service layer.
 *
 * These are plain Error subclasses — the service layer doesn't know about
 * HTTP. The pops-api router/middleware maps them to the appropriate status
 * codes when surfacing to clients. Mirrors `@pops/core-db`'s error pattern.
 */

export class WishListItemNotFoundError extends Error {
  override readonly name = 'WishListItemNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Wish list item '${id}' not found`);
    this.id = id;
  }
}

export class TransactionTagRuleNotFoundError extends Error {
  override readonly name = 'TransactionTagRuleNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Transaction tag rule '${id}' not found`);
    this.id = id;
  }
}

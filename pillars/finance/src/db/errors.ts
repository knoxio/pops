/**
 * Typed errors raised by the finance domain service layer.
 *
 * These are plain Error subclasses — the service layer doesn't know about
 * HTTP. The pops-api router/middleware maps them to the appropriate status
 * codes when surfacing to clients. Follows the standard typed-error pattern.
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

export class TransactionNotFoundError extends Error {
  override readonly name = 'TransactionNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Transaction '${id}' not found`);
    this.id = id;
  }
}

export class TransactionAlreadyExistsError extends Error {
  override readonly name = 'TransactionAlreadyExistsError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Transaction '${id}' already exists`);
    this.id = id;
  }
}

export class ImportTransactionPersistError extends Error {
  override readonly name = 'ImportTransactionPersistError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Import transaction insert succeeded but row not found: ${id}`);
    this.id = id;
  }
}

export class BudgetNotFoundError extends Error {
  override readonly name = 'BudgetNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Budget '${id}' not found`);
    this.id = id;
  }
}

export class BudgetConflictError extends Error {
  override readonly name = 'BudgetConflictError' as const;
  readonly category: string;
  readonly period: string | null;

  constructor(category: string, period: string | null) {
    const periodDesc = period === null ? 'null' : `'${period}'`;
    super(`Budget with category '${category}' and period ${periodDesc} already exists`);
    this.category = category;
    this.period = period;
  }
}

export class TransactionCorrectionNotFoundError extends Error {
  override readonly name = 'TransactionCorrectionNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Transaction correction '${id}' not found`);
    this.id = id;
  }
}

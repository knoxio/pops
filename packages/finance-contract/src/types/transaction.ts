/**
 * A single finance transaction. Mirrors the API response (camelCase) for
 * the finance pillar. DB-internal shape lives in `@pops/finance-db` and is
 * not surfaced through the contract.
 *
 * The contract shape is deliberately narrower than the current runtime
 * persistence row: it pins only the fields downstream consumers (apps, iOS
 * Swift codegen, SDK) need to render and reference a transaction. Extra
 * fields the API still emits today (`account`, `type`, `location`, etc.)
 * are not part of the contract and may be removed without a contract bump.
 */
export interface Transaction {
  id: string;
  description: string;
  amount: number;
  /** Date-only string (`YYYY-MM-DD`). Validated by `TransactionSchema` via `.date()`. Mirrors the API's date-only finance transaction shape. */
  date: string;
  entityId: string | null;
  /**
   * Stable identifiers for the tags attached to this transaction. Empty
   * array when the transaction has no tags. Order is preserved from the
   * source row.
   */
  tagIds: readonly string[];
  /** ISO-8601 timestamp. Validated by `TransactionSchema` via `.datetime()`. */
  lastEditedTime: string;
}

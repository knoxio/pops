/**
 * A single finance transaction (camelCase). DB-internal row shape lives in
 * `@pops/finance-db` and is not surfaced through the contract.
 *
 * Deliberately narrower than what the API emits: it pins only the fields
 * downstream consumers (apps, iOS Swift codegen, SDK) need. Fields outside
 * this interface carry no contract guarantee.
 */
export interface Transaction {
  id: string;
  description: string;
  amount: number;
  /** Date-only string (`YYYY-MM-DD`). Validated by `TransactionSchema` via `.date()`. */
  date: string;
  entityId: string | null;
  /** Tag ids in source-row order; empty when the transaction has no tags. */
  tagIds: readonly string[];
  /** ISO-8601 timestamp. Validated by `TransactionSchema` via `.datetime()`. */
  lastEditedTime: string;
}

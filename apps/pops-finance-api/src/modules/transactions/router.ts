/**
 * Transaction tRPC router — CRUD via `@pops/finance-db`'s `transactionsService`.
 *
 * Migrated from `apps/pops-api/src/modules/finance/transactions/router.ts`
 * as part of Phase 5 PR 1 (Track M2). The finance DB handle is injected
 * via the tRPC context rather than reached through `getFinanceDrizzle()`
 * so finance-api stands alone of pops-api in the dep graph. Procedure
 * paths stay rooted at `finance.transactions.*` for a transparent
 * dispatcher swap in Phase 5 PR 2.
 *
 * **Scope: 6 of 9 procedures.** The CRUD slice (list/get/create/update/
 * delete/restore) is in scope. The following stay on the legacy pops-api
 * router as fall-through because their implementations reach into
 * cross-pillar surfaces still living in pops-api:
 *
 *   - `suggestTags`               — uses `modules/finance/tag-suggester`,
 *     which pulls in `core/corrections/{service,types-base}` and now reads
 *     `entities` + `transaction_tag_rules` via the finance pillar handle
 *     (PRD-212 hot-path move).
 *   - `listDescriptionsForPreview` — issues raw drizzle reads against the
 *     `transactions` table via `getDrizzle()` (legacy pops.db); the
 *     equivalent helper isn't exposed by `@pops/finance-db` yet.
 *   - `availableTags`              — issues raw better-sqlite3 reads via
 *     `getDb()` (legacy pops.db); same shape as above.
 *
 * These three follow the M4 / M5 precedent of leaving entangled
 * procedures on the legacy side until the cross-pillar surfaces they
 * depend on move out of pops-api. The legacy router keeps serving them
 * unchanged; the dispatcher swap in PR 2 will only route the in-scope
 * procedure paths to finance-api.
 *
 * Domain errors from `@pops/finance-db` (`TransactionNotFoundError`,
 * `TransactionAlreadyExistsError`) are translated to local `HttpError`
 * subclasses inside each handler and then routed through
 * `mapDomainErrors` so the tRPC layer sees a proper `TRPCError` with
 * the right wire-level `code` (`NOT_FOUND` / `CONFLICT`).
 */
import { z } from 'zod';

import {
  TransactionAlreadyExistsError,
  TransactionNotFoundError,
  transactionsService,
} from '@pops/finance-db';

import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { paginationMeta, PaginationMetaSchema } from '../../shared/pagination.js';
import { mapDomainErrors } from '../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../trpc.js';
import {
  CreateTransactionSchema,
  toTransaction,
  type TransactionFilters,
  TransactionQuerySchema,
  TransactionSchema,
  TransactionSnapshotSchema,
  UpdateTransactionSchema,
} from './types.js';

/** Default pagination values. */
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

function runTransaction<T>(id: string | undefined, fn: () => T): T {
  return mapDomainErrors(() => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof TransactionNotFoundError) {
        throw new NotFoundError('Transaction', id ?? err.id);
      }
      if (err instanceof TransactionAlreadyExistsError) {
        throw new ConflictError(err.message);
      }
      throw err;
    }
  });
}

export const transactionsRouter = router({
  /** List transactions with optional filters and pagination. */
  list: protectedProcedure
    .input(TransactionQuerySchema)
    .output(z.object({ data: z.array(TransactionSchema), pagination: PaginationMetaSchema }))
    .query(({ input, ctx }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;

      const filters: TransactionFilters = {
        search: input.search,
        account: input.account,
        startDate: input.startDate,
        endDate: input.endDate,
        tag: input.tag,
        entityId: input.entityId,
        type: input.type,
      };

      const { rows, total } = transactionsService.listTransactions(
        ctx.financeDb,
        filters,
        limit,
        offset
      );

      return {
        data: rows.map(toTransaction),
        pagination: paginationMeta(total, limit, offset),
      };
    }),

  /** Get a single transaction by ID. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.object({ data: TransactionSchema }))
    .query(({ input, ctx }) =>
      runTransaction(input.id, () => {
        const row = transactionsService.getTransaction(ctx.financeDb, input.id);
        return { data: toTransaction(row) };
      })
    ),

  /** Create a new transaction. */
  create: protectedProcedure.input(CreateTransactionSchema).mutation(({ input, ctx }) =>
    runTransaction(undefined, () => {
      const row = transactionsService.createTransaction(ctx.financeDb, input);
      return { data: toTransaction(row), message: 'Transaction created' };
    })
  ),

  /** Update an existing transaction. */
  update: protectedProcedure
    .input(z.object({ id: z.string(), data: UpdateTransactionSchema }))
    .mutation(({ input, ctx }) =>
      runTransaction(input.id, () => {
        const row = transactionsService.updateTransaction(ctx.financeDb, input.id, input.data);
        return { data: toTransaction(row), message: 'Transaction updated' };
      })
    ),

  /**
   * Delete a transaction. Returns the deleted row as a `snapshot` so the
   * client can offer Undo via `restore`. The snapshot carries the full row
   * including original id, checksum, raw_row, and notion_id — fields that
   * the list shape strips and that an Undo flow needs to preserve.
   */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input, ctx }) =>
    runTransaction(input.id, () => {
      const snapshot = transactionsService.deleteTransaction(ctx.financeDb, input.id);
      return { message: 'Transaction deleted', snapshot };
    })
  ),

  /**
   * Restore a previously-deleted transaction from a snapshot returned by
   * `delete`. Re-inserts preserving id and dedup metadata so a re-import of
   * the same source row is still detected as a duplicate.
   *
   * Note: SQLite's `ON DELETE SET NULL` already cleared `inventory.purchase_transaction_id`
   * pointers when the original delete ran. Restore re-creates the
   * transaction id but does not auto-reattach those FKs — that requires
   * a separate manual step.
   */
  restore: protectedProcedure.input(TransactionSnapshotSchema).mutation(({ input, ctx }) =>
    runTransaction(input.id, () => {
      const row = transactionsService.restoreTransaction(ctx.financeDb, input);
      return { data: toTransaction(row), message: 'Transaction restored' };
    })
  ),
});

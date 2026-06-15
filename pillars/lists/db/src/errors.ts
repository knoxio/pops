/**
 * Typed errors raised by the lists domain service layer.
 *
 * Plain Error subclasses — the service layer doesn't know about HTTP.
 * Pops-api routers map them to the appropriate tRPC codes when surfacing
 * to clients. Mirrors `@pops/inventory-db` / `@pops/finance-db` /
 * `@pops/media-db` / `@pops/cerebrum-db` / `@pops/food-db` error patterns.
 *
 * Phase 1 PR 1 ships only the list-items errors. The `ListNotFoundError`
 * surfaced by the broader `lists` slice stays in `@pops/app-lists-db`
 * until the next slice migrates.
 */

export class ListItemNotFoundError extends Error {
  override readonly name = 'ListItemNotFoundError' as const;
  readonly itemId: number;

  constructor(itemId: number) {
    super(`List item #${itemId} not found`);
    this.itemId = itemId;
  }
}

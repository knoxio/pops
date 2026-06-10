/**
 * Typed errors raised by the food domain service layer.
 *
 * Plain Error subclasses — the service layer doesn't know about HTTP.
 * Pops-api routers map them to the appropriate tRPC codes when surfacing
 * to clients. Mirrors `@pops/inventory-db` / `@pops/finance-db` /
 * `@pops/media-db` / `@pops/cerebrum-db` error patterns.
 */

export class PrepStateNotFoundError extends Error {
  override readonly name = 'PrepStateNotFoundError' as const;
  readonly id: number;

  constructor(id: number) {
    super(`Prep state '${id}' not found`);
    this.id = id;
  }
}

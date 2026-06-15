/**
 * Typed errors raised by the inventory domain service layer.
 *
 * Plain Error subclasses — the service layer doesn't know about HTTP.
 * Pops-api routers map them to the appropriate tRPC codes when surfacing
 * to clients. Mirrors `@pops/core-db`'s error pattern.
 */

export class LocationNotFoundError extends Error {
  override readonly name = 'LocationNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Location '${id}' not found`);
    this.id = id;
  }
}

export class ParentLocationNotFoundError extends Error {
  override readonly name = 'ParentLocationNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Parent location '${id}' not found`);
    this.id = id;
  }
}

export class LocationSelfParentError extends Error {
  override readonly name = 'LocationSelfParentError' as const;
  readonly id: string;

  constructor(id: string) {
    super('A location cannot be its own parent');
    this.id = id;
  }
}

export class LocationCycleError extends Error {
  override readonly name = 'LocationCycleError' as const;
  readonly id: string;
  readonly newParentId: string;

  constructor(id: string, newParentId: string) {
    super('Moving this location would create a circular reference');
    this.id = id;
    this.newParentId = newParentId;
  }
}

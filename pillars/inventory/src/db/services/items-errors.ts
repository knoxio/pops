/**
 * Typed errors raised by the items service layer.
 *
 * Plain Error subclasses — the service layer is HTTP-agnostic. The contract
 * router maps these to HTTP status codes.
 */

export class ItemNotFoundError extends Error {
  override readonly name = 'ItemNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Inventory item '${id}' not found`);
    this.id = id;
  }
}

export class ItemConflictError extends Error {
  override readonly name = 'ItemConflictError' as const;
  readonly field: string;
  readonly value: string;

  constructor(field: string, value: string) {
    super(`Inventory item with ${field} '${value}' already exists`);
    this.field = field;
    this.value = value;
  }
}

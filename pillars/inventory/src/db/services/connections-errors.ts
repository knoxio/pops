/**
 * Typed errors raised by the item connections service layer.
 *
 * Plain Error subclasses — the service layer is HTTP-agnostic. The API module
 * layer translates these into `HttpError`s, which `runHttp` maps to the wire
 * error envelope.
 */

export class ConnectionNotFoundError extends Error {
  override readonly name = 'ConnectionNotFoundError' as const;
  readonly itemAId: string;
  readonly itemBId: string;

  constructor(itemAId: string, itemBId: string) {
    super(`Item connection '${itemAId}-${itemBId}' not found`);
    this.itemAId = itemAId;
    this.itemBId = itemBId;
  }
}

export class ConnectionConflictError extends Error {
  override readonly name = 'ConnectionConflictError' as const;
  readonly itemAId: string;
  readonly itemBId: string;

  constructor(itemAId: string, itemBId: string) {
    super(`Connection between '${itemAId}' and '${itemBId}' already exists`);
    this.itemAId = itemAId;
    this.itemBId = itemBId;
  }
}

export class SelfConnectionError extends Error {
  override readonly name = 'SelfConnectionError' as const;
  readonly itemId: string;

  constructor(itemId: string) {
    super('Cannot connect an item to itself');
    this.itemId = itemId;
  }
}

export class ConnectionItemNotFoundError extends Error {
  override readonly name = 'ConnectionItemNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Inventory item '${id}' not found`);
    this.id = id;
  }
}

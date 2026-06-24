/**
 * Typed errors raised by the item documents service layer.
 *
 * Plain Error subclasses — the service layer is HTTP-agnostic. The contract
 * router maps these to HTTP status codes.
 */

export class DocumentNotFoundError extends Error {
  override readonly name = 'DocumentNotFoundError' as const;
  readonly id: number;

  constructor(id: number) {
    super(`Item document link '${id}' not found`);
    this.id = id;
  }
}

export class DocumentConflictError extends Error {
  override readonly name = 'DocumentConflictError' as const;
  readonly itemId: string;
  readonly paperlessDocumentId: number;

  constructor(itemId: string, paperlessDocumentId: number) {
    super(`Document '${paperlessDocumentId}' is already linked to item '${itemId}'`);
    this.itemId = itemId;
    this.paperlessDocumentId = paperlessDocumentId;
  }
}

export class DocumentItemNotFoundError extends Error {
  override readonly name = 'DocumentItemNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Inventory item '${id}' not found`);
    this.id = id;
  }
}

export class DocumentCreateFailedError extends Error {
  override readonly name = 'DocumentCreateFailedError' as const;
  readonly itemId: string;
  readonly paperlessDocumentId: number;

  constructor(itemId: string, paperlessDocumentId: number) {
    super(
      `Failed to create item document link for item '${itemId}' and paperless document '${paperlessDocumentId}'`
    );
    this.itemId = itemId;
    this.paperlessDocumentId = paperlessDocumentId;
  }
}

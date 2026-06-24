/**
 * Typed errors raised by the lists service layer.
 *
 * Plain Error subclasses — the service layer doesn't know about HTTP. The
 * API layer translates them to HttpError and runHttp maps that to the
 * status code surfaced to clients.
 */

export class ListNotFoundError extends Error {
  readonly listId: number;

  constructor(listId: number) {
    super(`List #${listId} not found`);
    this.name = 'ListNotFoundError';
    this.listId = listId;
  }
}

export class ListItemNotFoundError extends Error {
  readonly itemId: number;

  constructor(itemId: number) {
    super(`List item #${itemId} not found`);
    this.name = 'ListItemNotFoundError';
    this.itemId = itemId;
  }
}

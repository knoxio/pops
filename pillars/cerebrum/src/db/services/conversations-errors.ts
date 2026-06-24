/**
 * Typed errors raised by the conversations data-access layer.
 *
 * Plain Error subclasses — the service layer doesn't know about HTTP.
 * The contract layer maps them to status codes when surfacing to clients.
 */

export class ConversationNotFoundError extends Error {
  override readonly name = 'ConversationNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Conversation '${id}' not found`);
    this.id = id;
  }
}

export class ConversationConflictError extends Error {
  override readonly name = 'ConversationConflictError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Conversation with id '${id}' already exists`);
    this.id = id;
  }
}

export class MessageNotFoundError extends Error {
  override readonly name = 'MessageNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Message '${id}' not found`);
    this.id = id;
  }
}

export class MessageConflictError extends Error {
  override readonly name = 'MessageConflictError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Message with id '${id}' already exists`);
    this.id = id;
  }
}

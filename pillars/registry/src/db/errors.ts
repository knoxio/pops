/**
 * Typed errors raised by the registry service layer.
 *
 * These are plain Error subclasses — the service layer doesn't know about
 * HTTP. The API layer maps them to the appropriate status codes when
 * surfacing to clients.
 */

export class ServiceAccountNameAlreadyExistsError extends Error {
  override readonly name = 'ServiceAccountNameAlreadyExistsError' as const;
  readonly accountName: string;

  constructor(accountName: string) {
    super(`Service account '${accountName}' already exists`);
    this.accountName = accountName;
  }
}

export class ServiceAccountNotFoundError extends Error {
  override readonly name = 'ServiceAccountNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Service account '${id}' not found`);
    this.id = id;
  }
}

export class ServiceAccountAlreadyRevokedError extends Error {
  override readonly name = 'ServiceAccountAlreadyRevokedError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Service account '${id}' is already revoked`);
    this.id = id;
  }
}

export class SettingNotFoundError extends Error {
  override readonly name = 'SettingNotFoundError' as const;
  readonly key: string;

  constructor(key: string) {
    super(`Setting '${key}' not found`);
    this.key = key;
  }
}

export class AiBudgetNotFoundError extends Error {
  override readonly name = 'AiBudgetNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`AI budget '${id}' not found`);
    this.id = id;
  }
}

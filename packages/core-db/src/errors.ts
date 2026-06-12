/**
 * Typed errors raised by the core domain service layer.
 *
 * These are plain Error subclasses — the service layer doesn't know about
 * HTTP. The pops-api router/middleware maps them to the appropriate status
 * codes when surfacing to clients. Mirrors `@pops/app-food-db`'s error
 * pattern.
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

/**
 * Typed errors raised by the ai pillar domain service layer.
 *
 * These are plain Error subclasses — the service layer doesn't know about
 * HTTP. The REST handler layer maps them to the appropriate status codes
 * when surfacing to clients.
 */

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

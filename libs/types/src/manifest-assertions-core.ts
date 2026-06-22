/**
 * Internal primitives shared by the structural manifest assertions
 * (`manifest-assertions.ts` + `manifest-frontend-assertions.ts`). Split
 * out so each consumer can keep under the `max-lines: 200` cap without
 * a circular-import. Not re-exported from `@pops/types`.
 */
export function fail(context: string, message: string): never {
  throw new TypeError(`${context}: ${message}`);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function assertNonEmptyString(value: unknown, context: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    fail(context, `'${field}' must be a non-empty string`);
  }
}

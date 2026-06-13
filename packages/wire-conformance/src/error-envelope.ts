/**
 * Closed set of `error.code` values per wire-format §8.
 *
 * Pillars MUST NOT invent codes within v1; a new code requires an ADR
 * and a minor wire-format bump.
 */
export const KNOWN_CODES = new Set<string>([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_SUPPORTED',
  'TIMEOUT',
  'CONFLICT',
  'PRECONDITION_FAILED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'UNPROCESSABLE_CONTENT',
  'TOO_MANY_REQUESTS',
  'CLIENT_CLOSED_REQUEST',
  'INTERNAL_SERVER_ERROR',
  'PILLAR_UNAVAILABLE',
]);

export type ErrorEnvelope = {
  error: { code: string; message: string; data: Record<string, unknown> };
};

export function assertErrorEnvelope(body: unknown): asserts body is ErrorEnvelope {
  if (typeof body !== 'object' || body === null) throw new Error('body must be an object');
  const candidate = body as { error?: unknown };
  if (typeof candidate.error !== 'object' || candidate.error === null) {
    throw new Error('missing error envelope');
  }
  const err = candidate.error as { code?: unknown; message?: unknown; data?: unknown };
  if (typeof err.code !== 'string') throw new Error('error.code must be a string');
  if (typeof err.message !== 'string') throw new Error('error.message must be a string');
  if (typeof err.data !== 'object' || err.data === null) {
    throw new Error('error.data must be an object');
  }
}

export function expectStatus(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

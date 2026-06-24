/**
 * Shared zod building blocks for the media REST contract.
 *
 * Split from `rest.ts` so the per-domain route files (`rest-movies.ts`, …)
 * stay focused on their path maps. Everything here is zod-only — no imports
 * from `src/api/` or `src/db/`, so the contract honours the package
 * boundary (consumers see only `.`).
 *
 * These schemas describe the actual wire shapes the handlers serve, so the
 * OpenAPI projection is an honest description of what the server does.
 */
import { z } from 'zod';

/** Numeric identity. SQLite autoincrement ids arrive as strings on the wire; coerced. */
export const IdParam = z.coerce.number().int();

/**
 * `limit` query param. On the wire it arrives as a string; `z.coerce`
 * parses it. Optional — the handler applies the per-domain default.
 */
export const LimitQuery = z.coerce.number().int().positive().optional();

/** `offset` query param. String on the wire; coerced; optional. */
export const OffsetQuery = z.coerce.number().int().nonnegative().optional();

/** Pagination envelope returned by every list endpoint. Mirrors `shared/pagination.ts`. */
export const PaginationMetaSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});

/**
 * Error envelope. `messageKey` carries the i18n key the FE resolves to a
 * localised string.
 */
export const ErrorBodySchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  messageKey: z.string().optional(),
});

/** Bare `{ message }` body returned by delete-style mutations. */
export const MessageSchema = z.object({ message: z.string() });

/**
 * Common error responses spread into every route that can fail through the
 * shared `HttpError` mapping (`mapHttpError`). `strictStatusCodes` is off on
 * the composer, but declaring them keeps the handler return types honest and
 * the OpenAPI projection complete.
 */
export const ERR_RESPONSES = {
  400: ErrorBodySchema,
  404: ErrorBodySchema,
  409: ErrorBodySchema,
} as const;

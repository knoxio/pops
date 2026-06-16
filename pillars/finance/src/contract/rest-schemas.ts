/**
 * Shared zod building blocks for the finance REST contract.
 *
 * Split from `rest.ts` so the per-domain route files (`rest-wishlist.ts`,
 * `rest-budgets.ts`, …) stay focused on their path maps. Everything here
 * is zod-only — no imports from `src/api/` or `src/db/`, so the contract
 * honours the package boundary (consumers see only `.`).
 *
 * These schemas describe the ACTUAL wire shapes the handlers serve (the
 * `to<Entity>` mappers in the legacy tRPC routers), not the idealised
 * `schemas/` entities from the pre-migration refactor. The OpenAPI
 * projection is therefore an honest description of what the server does.
 */
import { z } from 'zod';

/** String identity (uuid style). Path + body alike. */
export const NonEmptyString = z.string().min(1);

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
 * localised string (preserved from the tRPC `data.messageKey` wire shape).
 */
export const ErrorBodySchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  messageKey: z.string().optional(),
});

/** Bare `{ message }` body returned by delete-style mutations. */
export const MessageSchema = z.object({ message: z.string() });

/**
 * Common error responses spread into every route that can fail through
 * the shared `HttpError` mapping (`mapHttpError`). `strictStatusCodes`
 * is off on the composer, but declaring them keeps the handler return
 * types honest and the OpenAPI projection complete.
 */
export const ERR_RESPONSES = {
  400: ErrorBodySchema,
  404: ErrorBodySchema,
  409: ErrorBodySchema,
} as const;

/**
 * Error responses for routes that can additionally fail with 412 Precondition
 * Failed (the import session-targeted endpoints). Spread alongside or instead
 * of {@link ERR_RESPONSES} where a `PreconditionError` is reachable.
 */
export const ERR_RESPONSES_WITH_412 = {
  ...ERR_RESPONSES,
  412: ErrorBodySchema,
} as const;

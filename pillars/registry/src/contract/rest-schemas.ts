/**
 * Shared zod building blocks for the registry REST contract.
 *
 * Kept separate from the per-domain route files so each stays focused on its
 * path map. Everything here is zod-only — no imports from `src/api/` or
 * `src/db/`, so the contract honours the package boundary (consumers see only `.`).
 *
 * These schemas describe the ACTUAL wire shapes the handlers serve, so the
 * OpenAPI projection is an honest description of what the server does.
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
 * Error envelope. `code` carries the originating `HttpError` subclass name
 * (e.g. `NotFoundError`) so clients can branch without parsing `message`.
 */
export const ErrorBodySchema = z.object({
  message: z.string(),
  code: z.string().optional(),
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
 * Error responses for identity-gated routes. Adds `401` (unauthenticated, or a
 * principal the route refuses — the `userOnly` / `protected` gates) on top of
 * the common `400/404/409` set. Kept separate from {@link ERR_RESPONSES} so
 * routes that cannot return `401` keep an honest OpenAPI projection.
 */
export const AUTH_ERR_RESPONSES = {
  400: ErrorBodySchema,
  401: ErrorBodySchema,
  404: ErrorBodySchema,
  409: ErrorBodySchema,
} as const;

/**
 * Shared zod building blocks for the inventory REST contract.
 *
 * Split from `rest.ts` so the per-module route files (`rest-items.ts`,
 * `rest-locations.ts`, …) stay focused on their path maps. Everything
 * here is zod-only — no imports from `src/api/` or `src/db/`, so the
 * contract honours the package boundary (consumers see only `.`).
 */
import { z } from 'zod';

/**
 * Numeric path params arrive as strings on the wire — coerce them.
 * Used for the auto-increment ids (photos, documents, uploaded files).
 */
export const PathPositiveInt = z.coerce.number().int().positive();

/** String identity (uuid / asset-id style). Path + body alike. */
export const NonEmptyString = z.string().min(1);

/**
 * Boolean query param. On the wire a query value is a string, and
 * `z.coerce.boolean()` would treat `'false'` as truthy — so map `'true'`
 * (or a real `true`) to `true` and everything else to `false`.
 */
export const QueryBool = z.preprocess((v) => v === true || v === 'true', z.boolean());

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

/** Bare `{ message }` body returned by delete/disconnect-style mutations. */
export const MessageSchema = z.object({ message: z.string() });

/** Document-type enum shared by the documents + reports surfaces. */
export const DOCUMENT_TYPE_ENUM = z.enum(['receipt', 'warranty', 'manual', 'invoice', 'other']);

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

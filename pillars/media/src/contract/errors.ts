import { z } from 'zod';

/**
 * Shared error envelope every contract surfaces. Cross-pillar callers
 * branch on `kind` to render UX (placeholder for `unavailable`, retry for
 * `degraded`, etc.) without needing pillar-specific knowledge.
 *
 * Per-pillar domain errors extend this union — see `MediaDomainError`.
 */
export type ContractStatus = 'ok' | 'not-found' | 'unavailable' | 'degraded';

export const ContractStatusSchema = z.enum(['ok', 'not-found', 'unavailable', 'degraded']);

/**
 * Media-specific domain errors. Add new discriminants here as the pillar
 * grows; consumers narrow on `kind`.
 */
export type MediaDomainError =
  | { kind: 'tmdb-unavailable'; tmdbId: string }
  | { kind: 'unknown-tmdb-id'; tmdbId: string };

export const MediaDomainErrorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tmdb-unavailable'),
    tmdbId: z.string(),
  }),
  z.object({
    kind: z.literal('unknown-tmdb-id'),
    tmdbId: z.string(),
  }),
]);

export type MediaError = { kind: ContractStatus } | MediaDomainError;

export const MediaErrorSchema = z.union([
  z.object({ kind: ContractStatusSchema }).strict(),
  MediaDomainErrorSchema,
]);

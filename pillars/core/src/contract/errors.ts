import { z } from 'zod';

/**
 * Shared error envelope every contract surfaces. Cross-pillar callers
 * branch on `kind` to render UX (placeholder for `unavailable`, retry for
 * `degraded`, etc.) without needing pillar-specific knowledge.
 *
 * Per-pillar domain errors extend this union — see `CoreDomainError`.
 */
export type ContractStatus = 'ok' | 'not-found' | 'unavailable' | 'degraded';

export const ContractStatusSchema = z.enum(['ok', 'not-found', 'unavailable', 'degraded']);

/**
 * Core-specific domain errors. Add new discriminants here as the pillar
 * grows; consumers narrow on `kind`.
 */
export type CoreDomainError =
  | { kind: 'unknown-pillar'; pillarId: string }
  | { kind: 'pillar-not-registered'; pillarId: string };

export const CoreDomainErrorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unknown-pillar'),
    pillarId: z.string(),
  }),
  z.object({
    kind: z.literal('pillar-not-registered'),
    pillarId: z.string(),
  }),
]);

export type CoreError = { kind: ContractStatus } | CoreDomainError;

export const CoreErrorSchema = z.union([
  z.object({ kind: ContractStatusSchema }).strict(),
  CoreDomainErrorSchema,
]);

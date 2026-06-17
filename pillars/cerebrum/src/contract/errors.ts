import { z } from 'zod';

/**
 * Shared error envelope every contract surfaces. Cross-pillar callers
 * branch on `kind` to render UX (placeholder for `unavailable`, retry for
 * `degraded`, etc.) without needing pillar-specific knowledge.
 *
 * Per-pillar domain errors extend this union — see `CerebrumDomainError`.
 */
export type ContractStatus = 'ok' | 'not-found' | 'unavailable' | 'degraded';

export const ContractStatusSchema = z.enum(['ok', 'not-found', 'unavailable', 'degraded']);

/**
 * Cerebrum-specific domain errors. Add new discriminants here as the pillar
 * grows; consumers narrow on `kind`.
 */
export type CerebrumDomainError =
  | { kind: 'unknown-engram'; engramId: string }
  | { kind: 'engram-archived'; engramId: string };

export const CerebrumDomainErrorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unknown-engram'),
    engramId: z.string(),
  }),
  z.object({
    kind: z.literal('engram-archived'),
    engramId: z.string(),
  }),
]);

export type CerebrumError = { kind: ContractStatus } | CerebrumDomainError;

export const CerebrumErrorSchema = z.union([
  z.object({ kind: ContractStatusSchema }).strict(),
  CerebrumDomainErrorSchema,
]);

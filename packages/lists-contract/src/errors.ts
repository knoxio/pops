import { z } from 'zod';

/**
 * Shared error envelope every contract surfaces. Cross-pillar callers
 * branch on `kind` to render UX (placeholder for `unavailable`, retry for
 * `degraded`, etc.) without needing pillar-specific knowledge.
 *
 * Per-pillar domain errors extend this union — see `ListsDomainError`.
 */
export type ContractStatus = 'ok' | 'not-found' | 'unavailable' | 'degraded';

export const ContractStatusSchema = z.enum(['ok', 'not-found', 'unavailable', 'degraded']);

/**
 * Lists-specific domain errors. Add new discriminants here as the pillar
 * grows; consumers narrow on `kind`.
 */
export type ListsDomainError =
  | { kind: 'unknown-list-item'; listItemId: string }
  | { kind: 'list-item-archived'; listItemId: string };

export const ListsDomainErrorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unknown-list-item'),
    listItemId: z.string(),
  }),
  z.object({
    kind: z.literal('list-item-archived'),
    listItemId: z.string(),
  }),
]);

export type ListsError = { kind: ContractStatus } | ListsDomainError;

export const ListsErrorSchema = z.union([
  z.object({ kind: ContractStatusSchema }).strict(),
  ListsDomainErrorSchema,
]);

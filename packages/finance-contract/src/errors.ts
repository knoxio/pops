import { z } from 'zod';

/**
 * Shared error envelope every contract surfaces. Cross-pillar callers
 * branch on `kind` to render UX (placeholder for `unavailable`, retry for
 * `degraded`, etc.) without needing pillar-specific knowledge.
 *
 * Per-pillar domain errors extend this union — see `FinanceDomainError`.
 */
export type ContractStatus = 'ok' | 'not-found' | 'unavailable' | 'degraded';

export const ContractStatusSchema = z.enum(['ok', 'not-found', 'unavailable', 'degraded']);

/**
 * Finance-specific domain errors. Add new discriminants here as the pillar
 * grows; consumers narrow on `kind`.
 */
export type FinanceDomainError =
  | { kind: 'budget-exceeded'; budgetId: string; overspendCents: number }
  | { kind: 'invalid-currency'; code: string };

export const FinanceDomainErrorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('budget-exceeded'),
    budgetId: z.string(),
    overspendCents: z.number().int(),
  }),
  z.object({
    kind: z.literal('invalid-currency'),
    code: z.string(),
  }),
]);

export type FinanceError = { kind: ContractStatus } | FinanceDomainError;

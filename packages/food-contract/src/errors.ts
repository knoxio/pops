import { z } from 'zod';

/**
 * Shared error envelope every contract surfaces. Cross-pillar callers
 * branch on `kind` to render UX (placeholder for `unavailable`, retry for
 * `degraded`, etc.) without needing pillar-specific knowledge.
 *
 * Per-pillar domain errors extend this union — see `FoodDomainError`.
 */
export type ContractStatus = 'ok' | 'not-found' | 'unavailable' | 'degraded';

export const ContractStatusSchema = z.enum(['ok', 'not-found', 'unavailable', 'degraded']);

/**
 * Food-specific domain errors. Add new discriminants here as the pillar
 * grows; consumers narrow on `kind`.
 */
export type FoodDomainError =
  | { kind: 'unknown-recipe'; recipeId: string }
  | { kind: 'recipe-archived'; recipeId: string };

export const FoodDomainErrorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unknown-recipe'),
    recipeId: z.string(),
  }),
  z.object({
    kind: z.literal('recipe-archived'),
    recipeId: z.string(),
  }),
]);

export type FoodError = { kind: ContractStatus } | FoodDomainError;

export const FoodErrorSchema = z.union([
  z.object({ kind: ContractStatusSchema }).strict(),
  FoodDomainErrorSchema,
]);

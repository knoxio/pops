import { z } from 'zod';

/**
 * Shared error envelope every contract surfaces. Cross-pillar callers
 * branch on `kind` to render UX (placeholder for `unavailable`, retry for
 * `degraded`, etc.) without needing pillar-specific knowledge.
 *
 * Per-pillar domain errors extend this union — see `InventoryDomainError`.
 */
export type ContractStatus = 'ok' | 'not-found' | 'unavailable' | 'degraded';

export const ContractStatusSchema = z.enum(['ok', 'not-found', 'unavailable', 'degraded']);

/**
 * Inventory-specific domain errors. Add new discriminants here as the pillar
 * grows; consumers narrow on `kind`.
 */
export type InventoryDomainError =
  | { kind: 'unknown-location'; locationId: string }
  | { kind: 'item-archived'; itemId: string };

export const InventoryDomainErrorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unknown-location'),
    locationId: z.string(),
  }),
  z.object({
    kind: z.literal('item-archived'),
    itemId: z.string(),
  }),
]);

export type InventoryError = { kind: ContractStatus } | InventoryDomainError;

export const InventoryErrorSchema = z.union([
  z.object({ kind: ContractStatusSchema }).strict(),
  InventoryDomainErrorSchema,
]);

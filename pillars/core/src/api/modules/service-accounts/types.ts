/**
 * Zod contract schemas for the service-accounts admin router. The shapes
 * are byte-identical to `apps/pops-api/src/modules/core/service-accounts/types.ts`
 * — the duplication is intentional during the additive Phase 5 PR 1
 * window so the legacy pops-api router can keep serving traffic while
 * core-api stands up its own copy.
 */
import { z } from 'zod';

export const ServiceAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdBy: z.string().nullable(),
});

export type ServiceAccount = z.infer<typeof ServiceAccountSchema>;

export const CreateServiceAccountInputSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z][a-z0-9_-]*$/, 'lowercase letters, digits, underscore or hyphen'),
  scopes: z.array(z.string().min(1)).min(1),
});

export type CreateServiceAccountInput = z.infer<typeof CreateServiceAccountInputSchema>;

export const CreatedServiceAccountSchema = ServiceAccountSchema.extend({
  plaintextKey: z.string(),
});

export type CreatedServiceAccount = z.infer<typeof CreatedServiceAccountSchema>;

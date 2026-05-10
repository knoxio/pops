/**
 * Public types for service accounts. Anything that crosses an API boundary
 * never includes the plaintext key (it is only returned at creation time
 * via {@link CreatedServiceAccount}).
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
  /** Plaintext key — shown to the operator exactly once at creation time. */
  plaintextKey: z.string(),
});

export type CreatedServiceAccount = z.infer<typeof CreatedServiceAccountSchema>;

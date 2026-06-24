/**
 * Wire schemas for the service-accounts admin surface.
 *
 * These are the LOOSE shapes the admin handlers actually serve, distinct from
 * the stricter cross-pillar {@link ServiceAccountSchema} in `service-account.ts`
 * (which validates `.datetime()` / `.readonly()`). The admin surface returns
 * raw service rows whose `lastUsedAt` is written via SQLite's
 * `datetime('now')` (`YYYY-MM-DD HH:MM:SS`, not strict ISO), so the timestamps
 * are typed as plain `z.string()` to mirror exactly what the row carries.
 *
 * The REST contract (`rest-service-accounts.ts`) and the admin handlers
 * (`api/modules/service-accounts`) both source their shapes from here, so the
 * wire surface stays byte-identical with a single source of truth.
 */
import { z } from 'zod';

export const ServiceAccountAdminSchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdBy: z.string().nullable(),
});

export type ServiceAccountAdmin = z.infer<typeof ServiceAccountAdminSchema>;

export const CreateServiceAccountInputSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z][a-z0-9_-]*$/, 'lowercase letters, digits, underscore or hyphen'),
  scopes: z.array(z.string().min(1)).min(1),
});

export type CreateServiceAccountInput = z.infer<typeof CreateServiceAccountInputSchema>;

export const CreatedServiceAccountSchema = ServiceAccountAdminSchema.extend({
  plaintextKey: z.string(),
});

export type CreatedServiceAccount = z.infer<typeof CreatedServiceAccountSchema>;

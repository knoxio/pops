import { z } from 'zod';

import type {
  FeatureCredentialStatus,
  FeatureManifest,
  FeatureScope,
  FeatureStatus,
} from '@pops/types';

/**
 * Zod schemas mirroring the feature output types from `@pops/types`. The
 * TypeScript types remain the source of truth; these schemas are the wire
 * validators the ts-rest contract (S2) layers on top of this service's
 * outputs. `satisfies z.ZodType<…>` keeps each schema structurally locked to
 * its `@pops/types` counterpart at compile time.
 *
 * Note: the feature *input* (declared) shape — `FeatureManifestDescriptor`
 * with the declarative `capability` descriptor — is owned by the manifest
 * wire schema in `@pops/pillar-sdk` and is not re-declared here.
 */

export const FeatureScopeSchema = z.enum([
  'system',
  'user',
  'capability',
]) satisfies z.ZodType<FeatureScope>;

export const FeatureCredentialStatusSchema = z.object({
  key: z.string(),
  source: z.enum(['database', 'environment', 'missing']),
  envVar: z.string().optional(),
}) satisfies z.ZodType<FeatureCredentialStatus>;

export const FeatureStatusSchema = z.object({
  key: z.string(),
  manifestId: z.string(),
  label: z.string(),
  description: z.string().optional(),
  scope: FeatureScopeSchema,
  enabled: z.boolean(),
  default: z.boolean(),
  state: z.enum(['enabled', 'disabled', 'unavailable']),
  credentials: z.array(FeatureCredentialStatusSchema),
  capabilityMissing: z.boolean().optional(),
  preview: z.boolean().optional(),
  deprecated: z.boolean().optional(),
  configureLink: z.string().optional(),
  userOverride: z.boolean().optional(),
}) satisfies z.ZodType<FeatureStatus>;

export const FeatureDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().optional(),
  default: z.boolean(),
  scope: FeatureScopeSchema,
  requires: z.array(z.string()).optional(),
  requiresEnv: z.array(z.string()).optional(),
  preview: z.boolean().optional(),
  deprecated: z.boolean().optional(),
  settingKey: z.string().optional(),
  configureLink: z.string().optional(),
});

export const FeatureManifestSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().optional(),
  order: z.number(),
  features: z.array(FeatureDefinitionSchema),
}) satisfies z.ZodType<FeatureManifest>;

import { z } from 'zod';

/** Zod schemas mirroring the FeatureManifest types from @pops/types. */
export const FeatureScopeSchema = z.enum(['system', 'user', 'capability']);

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
});

export const FeatureCredentialStatusSchema = z.object({
  key: z.string(),
  source: z.enum(['database', 'environment', 'missing']),
  envVar: z.string().optional(),
});

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
});

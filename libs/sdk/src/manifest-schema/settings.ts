import { z } from 'zod';

const PROCEDURE_PATH = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*\.[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/,
    'must match <pillar>.<router>.<procedure>'
  );

const SETTINGS_FIELD_TYPE = z.enum([
  'text',
  'number',
  'toggle',
  'select',
  'password',
  'url',
  'duration',
  'json',
]);

const SETTINGS_FIELD_OPTION = z.object({ value: z.string(), label: z.string() }).strict();

const SETTINGS_FIELD_VALIDATION = z
  .object({
    required: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    message: z.string().optional(),
  })
  .strict();

const SETTINGS_FIELD_TEST_ACTION = z
  .object({ procedure: PROCEDURE_PATH, label: z.string() })
  .strict();

const SETTINGS_FIELD_OPTIONS_LOADER = z
  .object({
    procedure: PROCEDURE_PATH,
    valueKey: z.string(),
    labelKey: z.string(),
  })
  .strict();

const SETTINGS_FIELD = z
  .object({
    key: z.string(),
    label: z.string(),
    description: z.string().optional(),
    type: SETTINGS_FIELD_TYPE,
    default: z.string().optional(),
    options: z.array(SETTINGS_FIELD_OPTION).optional(),
    validation: SETTINGS_FIELD_VALIDATION.optional(),
    envFallback: z.string().optional(),
    sensitive: z.boolean().optional(),
    requiresRestart: z.boolean().optional(),
    testAction: SETTINGS_FIELD_TEST_ACTION.optional(),
    optionsLoader: SETTINGS_FIELD_OPTIONS_LOADER.optional(),
  })
  .strict();

const SETTINGS_GROUP = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    fields: z.array(SETTINGS_FIELD),
  })
  .strict();

/**
 * Settings UI contribution descriptor — peer of `SinkDescriptor`,
 * `SEARCH_ADAPTER`, and `AI_TOOL`. Mirrors the `SettingsManifest` shape
 * from `@pops/types` so the wire validator can confirm an inbound
 * manifest carries a well-formed settings tree. The TypeScript shape in
 * `@pops/types` remains the source of truth; this Zod schema is the wire
 * validator (PRD-240 US-01 / ADR-037).
 */
export const SettingsManifestDescriptorSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    icon: z.string().optional(),
    order: z.number(),
    groups: z.array(SETTINGS_GROUP),
  })
  .strict();

export const SettingsBlockSchema = z
  .object({
    manifests: z.array(SettingsManifestDescriptorSchema),
  })
  .strict();

export type SettingsManifestDescriptor = z.infer<typeof SettingsManifestDescriptorSchema>;

/**
 * Settings manifest types — shared between API (registry) and frontend (renderer).
 *
 * The Zod schemas below are the single declaration of these shapes; the
 * TypeScript types are `z.infer` of them (ADR-049). They were previously a
 * TypeScript interface here and a hand-kept Zod restatement in
 * `@pops/pillar-sdk/manifest-schema`, which is how `SettingsGroup.widget`
 * reached production on one side only and crash-looped `pops-media-api`
 * (POPS-2581). A field can no longer exist on one side of that pair, because
 * there is no longer a pair.
 *
 * The schemas carry the wire refinements the registry's manifest validator
 * applies (`.strict()`, the procedure-path pattern). They erase to the same
 * TypeScript shapes, so a consumer that only wants the types is unaffected.
 */
import { z } from 'zod';

import { ProcedurePathSchema } from './manifest-primitives.js';

export const SettingsFieldTypeSchema = z.enum([
  'text',
  'number',
  'toggle',
  'select',
  'password',
  'url',
  'duration',
  'json',
]);

export type SettingsFieldType = z.infer<typeof SettingsFieldTypeSchema>;

export const SettingsFieldSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    description: z.string().optional(),
    type: SettingsFieldTypeSchema,
    default: z.string().optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() }).strict()).optional(),
    validation: z
      .object({
        required: z.boolean().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        pattern: z.string().optional(),
        message: z.string().optional(),
      })
      .strict()
      .optional(),
    envFallback: z.string().optional(),
    sensitive: z.boolean().optional(),
    requiresRestart: z.boolean().optional(),
    testAction: z.object({ procedure: ProcedurePathSchema, label: z.string() }).strict().optional(),
    /**
     * Load options dynamically from a GET route on the owning pillar's REST
     * contract, resolved at runtime as `pillarId.router.route`. The route must
     * return `{ data: Record<string, unknown>[] }`.
     */
    optionsLoader: z
      .object({
        procedure: ProcedurePathSchema,
        valueKey: z.string(),
        labelKey: z.string(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SettingsField = z.infer<typeof SettingsFieldSchema>;

/**
 * A pillar-owned React widget mounted inside a settings group, for flows the
 * declarative field renderer cannot express (an OAuth-style handshake, a
 * device pairing dance). Mirrors `ModuleCaptureOverlayConfig.bundleSlot`: the
 * manifest names a slot and the shell's resolved bundle map resolves it to
 * the component the owning pillar exports. Wire-shaped, so a section
 * discovered over the live registry carries it unchanged.
 *
 * `bundleSlot` is documented as kebab-case but validated only as non-empty:
 * the shell degrades an unresolvable slot to the group's fields, so a slot
 * this schema cannot love is a rendering detail, not a reason to reject a
 * whole pillar's registration.
 */
export const SettingsWidgetSchema = z.object({ bundleSlot: z.string().min(1) }).strict();

export type SettingsWidget = z.infer<typeof SettingsWidgetSchema>;

export const SettingsGroupSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    fields: z.array(SettingsFieldSchema),
    /**
     * Mounts a pillar-owned component above this group's fields. A group may
     * carry a widget, fields, or both; an unresolvable slot degrades to the
     * fields alone rather than failing the section.
     */
    widget: SettingsWidgetSchema.optional(),
  })
  .strict();

export type SettingsGroup = z.infer<typeof SettingsGroupSchema>;

/**
 * Settings UI contribution descriptor — peer of `SinkDescriptor`, the search
 * adapter and the AI tool descriptors. A pillar declares one per independently
 * navigable `/settings` section (PRD-240 US-01 / ADR-037).
 */
export const SettingsManifestSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    icon: z.string().optional(),
    order: z.number(),
    groups: z.array(SettingsGroupSchema),
  })
  .strict();

export type SettingsManifest = z.infer<typeof SettingsManifestSchema>;

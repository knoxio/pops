import { z } from 'zod';

const KEBAB_IDENTIFIER = z
  .string()
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'must be lowercase kebab-case identifier');

const BASE_PATH = z.string().regex(/^\//, 'must start with /');

const I18N_KEY = z.string().min(1);

const NAV_COLOR = z.enum(['emerald', 'indigo', 'amber', 'rose', 'sky', 'violet']);

const NAV_ITEM_DESCRIPTOR = z
  .object({
    path: z.string(),
    label: z.string().min(1),
    labelKey: I18N_KEY,
    icon: KEBAB_IDENTIFIER,
  })
  .strict();

/**
 * Wire-shaped descriptor of a pillar's app-rail entry. Mirrors the
 * `AppNavConfig` shape the shell consumes today (`apps/pops-shell/src/app/nav/types.ts`),
 * minus the runtime `IconName` enum dependency — icons travel the wire as
 * kebab-case identifiers and resolve to Lucide components shell-side.
 *
 * `order` is required: PRD-243 moves app-rail ordering off the
 * `registeredApps` array index and onto the manifest. Ties break
 * lexicographically by `id`.
 */
export const NavConfigDescriptorSchema = z
  .object({
    id: KEBAB_IDENTIFIER,
    label: z.string().min(1),
    labelKey: I18N_KEY,
    icon: KEBAB_IDENTIFIER,
    color: NAV_COLOR.optional(),
    basePath: BASE_PATH,
    order: z.number().int(),
    items: z.array(NAV_ITEM_DESCRIPTOR),
  })
  .strict();

/**
 * Wire-shaped descriptor of a routable page contributed by a pillar.
 * Carries the routing surface the shell consumes today; React component
 * refs come from the workspace bundle map at the shell side (US-03), so
 * the descriptor names a `bundleSlot` instead of carrying a component
 * directly.
 */
export const PageDescriptorSchema = z
  .object({
    path: z.string(),
    index: z.boolean().optional(),
    bundleSlot: KEBAB_IDENTIFIER,
  })
  .strict();

/**
 * Absolute URL where a pillar's frontend bundle is served from. Reserved
 * for the external-pillar UI loading mechanism (PRD-243 US-05, deferred).
 * Validated at the wire layer in US-01; not consumed by the shell today.
 */
export const AssetsBaseUrlSchema = z.string().url();

export type NavConfigDescriptor = z.infer<typeof NavConfigDescriptorSchema>;
export type NavItemDescriptor = z.infer<typeof NAV_ITEM_DESCRIPTOR>;
export type PageDescriptor = z.infer<typeof PageDescriptorSchema>;

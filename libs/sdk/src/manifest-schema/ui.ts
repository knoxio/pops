import { z } from 'zod';

import {
  AppPathSchema,
  I18nKeySchema,
  KebabIdentifierSchema,
  ModuleCaptureOverlayConfigSchema,
  type ModuleCaptureOverlayConfig,
} from '@pops/types';

const NAV_COLOR = z.enum(['emerald', 'indigo', 'amber', 'rose', 'sky', 'violet']);

const NAV_ITEM_DESCRIPTOR = z
  .object({
    path: z.string(),
    label: z.string().min(1),
    labelKey: I18nKeySchema,
    icon: KebabIdentifierSchema,
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
    id: KebabIdentifierSchema,
    label: z.string().min(1),
    labelKey: I18nKeySchema,
    icon: KebabIdentifierSchema,
    color: NAV_COLOR.optional(),
    basePath: AppPathSchema,
    order: z.number().int(),
    items: z.array(NAV_ITEM_DESCRIPTOR),
  })
  .strict();

/**
 * How deep a pillar may nest its pages.
 *
 * The wire is parsed from a manifest the shell did not author, and an
 * unbounded recursive schema is a parsing hazard rather than a feature. Three
 * levels covers every route tree in the repo with room to spare — food's
 * deepest is a layout with tabs beneath it, which is two — and a pillar that
 * wants more has a routing problem the wire should not quietly absorb.
 */
export const MAX_PAGE_DEPTH = 3;

/**
 * Wire-shaped descriptor of a routable page contributed by a pillar.
 * Carries the routing surface the shell consumes today; React component
 * refs come from the resolved bundle map at the shell side (US-03), so
 * the descriptor names a `bundleSlot` instead of carrying a component
 * directly.
 *
 * `children` carries a layout route's subtree. A pillar whose route table
 * nests — `food`'s `data` tabs under a layout that renders the tab chrome
 * around an `<Outlet/>`, `inventory`'s likewise — cannot be described without
 * it, and flattening the tree to fit a flat wire would make the transport
 * dictate the app's route structure: the layout would remount on every tab
 * switch, losing its state, to satisfy a schema (POPS-3256).
 */
export interface PageDescriptor {
  readonly path: string;
  readonly index?: boolean;
  readonly bundleSlot: string;
  readonly children?: readonly PageDescriptor[];
}

/**
 * Built per level rather than with `z.lazy`, so the depth bound is structural:
 * the schema for the last level has no `children` key at all and `.strict()`
 * rejects one. A `z.lazy` recursion would have to count depth at parse time
 * and would accept arbitrarily deep input first.
 */
function pageDescriptorAtDepth(remaining: number): z.ZodType<PageDescriptor> {
  const base = {
    path: z.string(),
    index: z.boolean().optional(),
    bundleSlot: KebabIdentifierSchema,
  };
  if (remaining <= 1) return z.object(base).strict() as z.ZodType<PageDescriptor>;
  return (
    z
      .object({ ...base, children: z.array(pageDescriptorAtDepth(remaining - 1)).optional() })
      .strict()
      // React Router rejects a route that is both an index and a layout, and it
      // rejects it by throwing at router construction — which for a
      // loader-mounted pillar means the shell's whole router, not just this
      // pillar's subtree. Refused here, where it is one pillar's manifest
      // failing to parse and being skipped.
      .refine(
        (page) => !(page.index === true && page.children !== undefined && page.children.length > 0),
        { message: 'an index route cannot have children' }
      ) as z.ZodType<PageDescriptor>
  );
}

export const PageDescriptorSchema: z.ZodType<PageDescriptor> =
  pageDescriptorAtDepth(MAX_PAGE_DEPTH);

/**
 * Where a pillar's frontend bundle is served from — the URL the shell's
 * runtime loader `import()`s (`pillars/shell/src/app/external-ui.tsx`).
 *
 * Either an absolute `http(s)` URL, for a pillar hosting its own assets on
 * another origin, or a root-relative path, for one served through the shell's
 * own nginx. The relative form is not a convenience: an in-repo pillar has no
 * way to know the origin the browser reached the shell on — a LAN name, a
 * Tailscale name and `localhost` all reach the same deployment — so an
 * absolute URL would have to be configured per host and would be wrong on the
 * others. It also keeps the module request same-origin, which is what makes
 * the shared-runtime import map apply to it without any CORS posture at all.
 */
export const AssetsBaseUrlSchema = z
  .string()
  .refine(
    (value) => value.startsWith('/') || /^https?:\/\//.test(value),
    'must be an absolute http(s) URL or a root-relative path'
  )
  .refine((value) => !value.startsWith('//'), 'must not be protocol-relative')
  .refine(
    (value) => !value.startsWith('/') || URL.canParse(value, 'http://placeholder.invalid'),
    'must be a well-formed path'
  );

/**
 * Wire-shaped descriptor of a pillar's capture overlay contribution. Declared
 * once in `@pops/types` as `ModuleCaptureOverlayConfigSchema` and re-exported
 * here under the manifest payload's name for it (ADR-049) — the shell
 * discovers overlays through the manifest registry the same way it discovers
 * `nav` / `pages` (PRD-243) and mounts the React component resolved from the
 * resolved bundle map, with no shell-side edit naming the pillar (PRD-246).
 */
export const CaptureOverlayDescriptorSchema = ModuleCaptureOverlayConfigSchema;

export type NavConfigDescriptor = z.infer<typeof NavConfigDescriptorSchema>;
export type NavItemDescriptor = z.infer<typeof NAV_ITEM_DESCRIPTOR>;
export type CaptureOverlayDescriptor = ModuleCaptureOverlayConfig;

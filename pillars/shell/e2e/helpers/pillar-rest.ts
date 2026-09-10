/**
 * Stand-ins for the REST surfaces the shell itself talks to on every load.
 *
 * A pillar's own routes belong in the spec that exercises that pillar — this
 * module covers only the shell's boot path and the search bar:
 *
 *   GET  /registry-api/registry/pillars  the full snapshot; boot resolves the
 *                                        install set from it before first
 *                                        render (`src/app/boot-snapshot.ts`)
 *   GET  /registry-api/shell/manifest    the operator's `POPS_APPS` selection,
 *                                        which `IndexRedirect` lands `/` on
 *   GET  /pillars, /pillars/health       the boot projection + health
 *                                        aggregator `PillarGuard` reads
 *   POST /orchestrator-api/search        federated search behind the top bar
 *
 * Leaving those unstubbed does not fail loudly: each one soft-fails to a
 * fallback, so the shell still renders and the spec still passes — against
 * the fallback path rather than the one it meant to test. Stubbing them is
 * what makes a run say the same thing twice.
 *
 * The route patterns are anchored regexes, not `**` globs, for one specific
 * reason: `**` spans `/`, so a glob for the pillar-boot endpoint `/pillars`
 * also swallows `/registry-api/registry/pillars`, and Playwright hands a URL
 * to the most recently registered match. That silently served the boot
 * resolver the wrong body and left every install-set assertion reading the
 * static floor instead.
 *
 * Every body below is run through the real consumer's parser or schema
 * before it is ever handed to `page.route`, not just written to look right:
 *
 *   - the manifest and the registry snapshot through `ManifestPayloadSchema` /
 *     `RegistrySnapshotPayloadSchema` (`@pops/pillar-sdk`) — the same zod
 *     schemas `normaliseSnapshotEntry` (`src/lib/registry-snapshot-fetch.ts`)
 *     validates a live snapshot against;
 *   - the shell manifest through a schema typed against the generated
 *     `ShellManifestResponses` (`src/registry-api/types.gen.ts`), which is
 *     itself regenerated from `@pops/registry`'s OpenAPI spec and diffed in
 *     CI (`generated-clients`, ADR-040) — a producer-side shape change is a
 *     compile error here before it is ever a runtime one;
 *   - the orchestrator search response through `parseSearchResponse`
 *     (`@pops/navigation`) — the literal function the search bar's own fetch
 *     runs the real response through.
 *
 * `/pillars` and `/pillars/health` carry no OpenAPI contract — they are the
 * informal boot projection `pillar-registry-client.ts` documents, not part of
 * any pillar's generated spec — so there is no existing schema to import.
 * Their validators below are hand-defined and pinned at the type level to the
 * same `PillarRegistryEntry` (`@pops/types`) and `PillarHealthStatus`
 * (`src/app/pillars/types.ts`) shapes that file's own parsers target, so a
 * change to either fails `tsc` here even though the runtime shape is
 * duplicated rather than imported.
 *
 * A stub that fails validation throws when the stub is set up (`stubX(page,
 * ...)`), before any route is registered or any request made — a spec sees a
 * synchronous, attributed error rather than a fallback-path pass or a hang
 * waiting on a route that never fulfils.
 */
import { z } from 'zod';

import { parseSearchResponse } from '@pops/navigation';
import { ManifestPayloadSchema, RegistrySnapshotPayloadSchema } from '@pops/pillar-sdk';

import type { Page, Route } from '@playwright/test';

import type { PillarRegistryEntry } from '@pops/types';

import type { ShellManifestResponses } from '../../src/registry-api/types.gen';

/** `<origin>/pillars` and nothing deeper — see the anchoring note above. */
const PILLAR_BOOT_URL = /^https?:\/\/[^/]+\/pillars$/;
const PILLAR_HEALTH_URL = /^https?:\/\/[^/]+\/pillars\/health$/;
const REGISTRY_SNAPSHOT_URL = /\/registry-api\/registry\/pillars$/;
const SHELL_MANIFEST_URL = /\/registry-api\/shell\/manifest$/;
const ORCHESTRATOR_SEARCH_URL = /\/orchestrator-api\/search$/;

/** Fulfil `route` with `body` as JSON. */
export function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/**
 * Parse `body` against `schema` and throw a message naming the stub and
 * every mismatched field when it does not match — never silently serve a
 * body the real client would reject.
 *
 * `schema` is untyped (`ZodTypeAny`) deliberately: several of the schemas
 * used below apply a `.transform()` (`RegistrySnapshotPayloadSchema`), whose
 * *output* type carries derived fields (`lastSeenAt`) the wire body never
 * has. Typing this against the schema's output would force every literal
 * body to fabricate those derived fields just to satisfy `tsc`, rather than
 * writing the wire shape the endpoint actually serves.
 *
 * Exported alongside `fulfilWith` for a per-spec stub whose body is built
 * inside the `page.route` handler rather than once at stub-construction time
 * — state mutated across requests (e.g. a revocation flipping a device's
 * `revokedAt` between polls) can't be validated up front the way `fulfilWith`
 * does, only as each response is produced. See `bfm-devices-pairing.spec.ts`.
 */
export function assertMatchesContract(schema: z.ZodTypeAny, body: unknown, label: string): void {
  const result = schema.safeParse(body);
  if (result.success) return;
  const issues = result.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`${label} stub no longer matches its contract:\n${issues}`);
}

/**
 * Validate `body` against `schema`, then return a `page.route` handler that
 * serves it. Validation runs immediately (not inside the returned handler),
 * so a drifted stub fails the moment the spec sets it up rather than when —
 * or if — the route is actually hit.
 *
 * Exported so a per-spec stub (a pillar's own routes, mocked directly in the
 * spec that exercises that pillar rather than here) can validate the same
 * way this file validates the shell's boot path — see
 * `bfm-devices-pairing.spec.ts` and `import-wizard-happy-path.spec.ts` for
 * the pattern. Unlike the schemas below, a per-spec stub cannot import its
 * pillar's real schema: `shell-no-cross-internal` (`.dependency-cruiser.cjs`)
 * lets the shell reach another pillar only through that pillar's
 * `@pops/app-<id>` UI package via its `index.ts` entrypoint, not through that
 * pillar's own `@pops/<id>` contract package or its generated Hey API
 * client — both out of reach even for a type-only import. A per-spec schema
 * is therefore hand-mirrored from the owning pillar's real schema (named in
 * a comment for traceability) rather than imported.
 */
export function fulfilWith(status: number, schema: z.ZodTypeAny, body: unknown, label: string) {
  assertMatchesContract(schema, body, label);
  return (route: Route) => json(route, status, body);
}

/**
 * `/pillars` and `/pillars/health` shapes — see the file header for why
 * these are hand-defined rather than imported.
 */
const PillarBootEntrySchema: z.ZodType<PillarRegistryEntry> = z
  .object({
    id: z.string().min(1),
    baseUrl: z.string().min(1),
  })
  .strict();

const PillarBootResponseSchema = z.object({ pillars: z.array(PillarBootEntrySchema) }).strict();

/** Mirrors `PillarHealthStatus` (`src/app/pillars/types.ts`). */
const PillarHealthResponseSchema = z
  .object({
    health: z.record(z.string(), z.enum(['healthy', 'unavailable', 'unknown'])),
  })
  .strict();

/** The `/registry-api/shell/manifest` response — `ManifestSchema` in `@pops/registry`'s ts-rest contract. */
const ShellManifestResponseSchema: z.ZodType<ShellManifestResponses[200]> = z
  .object({
    apps: z.array(z.string()),
    overlays: z.array(z.string()),
  })
  .strict();

/**
 * The smallest manifest `ManifestPayloadSchema` accepts. A snapshot entry
 * whose manifest fails that parse is dropped silently by
 * `normaliseSnapshotEntry`, which reads downstream as "the registry didn't
 * list this pillar" — so the required slots are all filled here even though
 * no assertion looks at them.
 */
function minimalManifest(pillarId: string): Record<string, unknown> {
  return {
    pillar: pillarId,
    version: '0.1.0',
    contract: {
      package: `@pops/${pillarId}-contract`,
      version: '0.1.0',
      tag: `contract-${pillarId}@v0.1.0`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}

/**
 * The UI surface a loader-mounted pillar advertises, by pillar id.
 *
 * Every in-repo pillar now mounts through the shell's runtime loader (the
 * static bundle map POPS-3227 removed used to make this unnecessary for most
 * of them), and everything the rail and the router know about a pillar comes
 * off this wire — so a stub that omits it produces a shell with no such
 * pillar, which is what a spec clicking its rail button discovers 30 seconds
 * later.
 *
 * Restated rather than imported from `@pops/purchases/manifest`: the point of
 * the change under test is that `@pops/shell` does not depend on the pillar,
 * and a devDependency added to write a stub is the same edge wearing a
 * different label. `pillars/purchases/src/api/__tests__/manifest.test.ts`
 * pins the real values; this only has to be a manifest the shell accepts and
 * a URL its dev server serves.
 */
const LOADER_MOUNTED_UI: Readonly<Record<string, Record<string, unknown>>> = {
  media: {
    assetsBaseUrl: '/media-ui/media.js',
    nav: {
      id: 'media',
      label: 'Media',
      labelKey: 'media',
      icon: 'film',
      color: 'indigo',
      basePath: '/media',
      order: 20,
      items: [
        { path: '', label: 'Library', labelKey: 'media.library', icon: 'film' },
        { path: '/watchlist', label: 'Watchlist', labelKey: 'media.watchlist', icon: 'bookmark' },
        { path: '/discover', label: 'Discover', labelKey: 'media.discover', icon: 'compass' },
      ],
    },
    // All twenty. The list this replaces carried eight, which was invisible
    // while the shell mounted media from its bundle map and a 404 on twelve
    // URLs the moment it stopped.
    pages: [
      { path: '', index: true, bundleSlot: 'media-library' },
      { path: 'movies/:id', bundleSlot: 'media-movie-detail' },
      { path: 'tv/:id', bundleSlot: 'media-tv-detail' },
      { path: 'tv/:id/season/:num', bundleSlot: 'media-season-detail' },
      { path: 'watchlist', bundleSlot: 'media-watchlist' },
      { path: 'history', bundleSlot: 'media-history' },
      { path: 'discover', bundleSlot: 'media-discover' },
      { path: 'rankings', bundleSlot: 'media-rankings' },
      { path: 'search', bundleSlot: 'media-search' },
      { path: 'compare', bundleSlot: 'media-compare' },
      { path: 'compare/history', bundleSlot: 'media-comparison-history' },
      { path: 'quick-pick', bundleSlot: 'media-quick-pick' },
      { path: 'rotation/log', bundleSlot: 'media-rotation-log' },
      { path: 'rotation/candidates', bundleSlot: 'media-candidate-queue' },
      { path: 'arr/calendar', bundleSlot: 'media-calendar' },
      { path: 'tier-list', bundleSlot: 'media-tier-list' },
      { path: 'plex', bundleSlot: 'media-plex-redirect' },
      { path: 'arr', bundleSlot: 'media-arr-redirect' },
      { path: 'rotation', bundleSlot: 'media-rotation-redirect' },
      { path: 'calendar', bundleSlot: 'media-calendar-redirect' },
    ],
  },
  cerebrum: {
    assetsBaseUrl: '/cerebrum-ui/cerebrum.js',
    nav: {
      id: 'cerebrum',
      label: 'Cerebrum',
      labelKey: 'cerebrum',
      icon: 'book-open',
      color: 'sky',
      basePath: '/cerebrum',
      order: 60,
      items: [
        { path: '', label: 'Ingest', labelKey: 'cerebrum.ingest', icon: 'file-text' },
        { path: '/engrams', label: 'Engrams', labelKey: 'cerebrum.engrams.nav', icon: 'library' },
        { path: '/query', label: 'Query', labelKey: 'cerebrum.query.nav', icon: 'search' },
      ],
    },
    pages: [
      { path: '', index: true, bundleSlot: 'cerebrum-ingest' },
      { path: 'chat', bundleSlot: 'cerebrum-chat' },
      { path: 'nudges', bundleSlot: 'cerebrum-nudges' },
      { path: 'proposals', bundleSlot: 'cerebrum-proposals' },
      { path: 'engrams', bundleSlot: 'cerebrum-engrams' },
      { path: 'engrams/:id', bundleSlot: 'cerebrum-engram-detail' },
      { path: 'documents', bundleSlot: 'cerebrum-documents' },
      { path: 'query', bundleSlot: 'cerebrum-query' },
      { path: 'reflex', bundleSlot: 'cerebrum-reflex' },
      { path: 'reflex/:name', bundleSlot: 'cerebrum-reflex-detail' },
      { path: 'plexus', bundleSlot: 'cerebrum-plexus' },
      { path: 'plexus/:adapterId', bundleSlot: 'cerebrum-plexus-detail' },
      { path: 'glia', bundleSlot: 'cerebrum-glia' },
    ],
    // Not a page: the shell's capture modal resolves this slot from the same
    // bundle (POPS-3266). A stub that omits it produces a shell whose capture
    // hotkey opens an empty modal.
    captureOverlay: {
      bundleSlot: 'ingest-form',
      order: 10,
      hotkey: 'cmd+shift+k',
      labelKey: 'cerebrum.captureOverlay.label',
    },
  },
  lists: {
    assetsBaseUrl: '/lists-ui/lists.js',
    nav: {
      id: 'lists',
      label: 'Lists',
      labelKey: 'lists',
      icon: 'list-checks',
      color: 'sky',
      basePath: '/lists',
      order: 50,
      items: [{ path: '', label: 'Home', labelKey: 'lists.home', icon: 'layout-dashboard' }],
    },
    // The detail page has no nav item — it is a deep link — so it appears here
    // and nowhere else a spec would notice it missing.
    pages: [
      { path: '', index: true, bundleSlot: 'lists-index' },
      { path: ':id', bundleSlot: 'lists-detail' },
    ],
  },
  inventory: {
    assetsBaseUrl: '/inventory-ui/inventory.js',
    nav: {
      id: 'inventory',
      label: 'Inventory',
      labelKey: 'inventory',
      icon: 'package',
      color: 'amber',
      basePath: '/inventory',
      order: 30,
      items: [
        { path: '', label: 'Items', labelKey: 'inventory.items', icon: 'package' },
        {
          path: '/warranties',
          label: 'Warranties',
          labelKey: 'inventory.warranties',
          icon: 'shield-check',
        },
        {
          path: '/locations',
          label: 'Locations',
          labelKey: 'inventory.locations',
          icon: 'map-pin',
        },
        { path: '/reports', label: 'Reports', labelKey: 'inventory.reports', icon: 'bar-chart-3' },
        {
          path: '/connections',
          label: 'Connections',
          labelKey: 'inventory.connections',
          icon: 'network',
        },
      ],
    },
    pages: [
      { path: '', index: true, bundleSlot: 'inventory-items' },
      { path: 'items/new', bundleSlot: 'inventory-item-form' },
      { path: 'items/:id', bundleSlot: 'inventory-item-detail' },
      { path: 'items/:id/edit', bundleSlot: 'inventory-item-form' },
      { path: 'connections', bundleSlot: 'inventory-connections' },
      { path: 'warranties', bundleSlot: 'inventory-warranties' },
      { path: 'locations', bundleSlot: 'inventory-location-tree' },
      {
        path: 'reports',
        bundleSlot: 'inventory-reports-group',
        children: [
          { path: '', index: true, bundleSlot: 'inventory-report-dashboard' },
          { path: 'insurance', bundleSlot: 'inventory-insurance-report' },
        ],
      },
      // The two legacy redirects, which the pillar's published page list had
      // been missing: a 404 on an old bookmark rather than a broken render.
      { path: 'report', bundleSlot: 'inventory-report-redirect' },
      { path: 'report/insurance', bundleSlot: 'inventory-insurance-report-redirect' },
    ],
  },
  food: {
    assetsBaseUrl: '/food-ui/food.js',
    nav: {
      id: 'food',
      label: 'Food',
      labelKey: 'food',
      icon: 'utensils',
      color: 'amber',
      basePath: '/food',
      order: 40,
      items: [
        { path: '', label: 'Home', labelKey: 'food.home', icon: 'layout-dashboard' },
        { path: '/recipes', label: 'Recipes', labelKey: 'food.recipes', icon: 'book-open' },
        { path: '/inbox', label: 'Inbox', labelKey: 'food.inbox', icon: 'bell' },
        { path: '/plan', label: 'Plan', labelKey: 'food.plan', icon: 'clock' },
        { path: '/fridge', label: 'Fridge', labelKey: 'food.fridge', icon: 'package' },
        { path: '/solve', label: 'Solve', labelKey: 'food.solve', icon: 'compass' },
        {
          path: '/shopping/from-plan',
          label: 'Shopping',
          labelKey: 'food.shopping',
          icon: 'list-checks',
        },
        { path: '/data', label: 'Manage data', labelKey: 'food.data', icon: 'database' },
        { path: '/prompts', label: 'Prompts', labelKey: 'food.prompts', icon: 'file-text' },
      ],
    },
    // The `data` tabs are children of the layout that renders their chrome,
    // which is the shape POPS-3256 taught the wire to carry. Flattened here,
    // the layout would remount on every tab switch.
    pages: [
      { path: '', index: true, bundleSlot: 'food-landing' },
      {
        path: 'data',
        bundleSlot: 'food-data-layout',
        children: [
          { path: '', index: true, bundleSlot: 'food-data-index' },
          { path: 'ingredients', bundleSlot: 'food-data-ingredients' },
          { path: 'aliases', bundleSlot: 'food-data-aliases' },
          { path: 'prep-states', bundleSlot: 'food-data-prep-states' },
          { path: 'substitutions', bundleSlot: 'food-data-substitutions' },
          { path: 'substitutions/graph', bundleSlot: 'food-data-substitutions-graph' },
          { path: 'conversions', bundleSlot: 'food-data-conversions' },
          { path: 'tags', bundleSlot: 'food-data-tags' },
        ],
      },
      { path: 'recipes', bundleSlot: 'food-recipe-list' },
      { path: 'recipes/new', bundleSlot: 'food-recipe-new' },
      { path: 'recipes/:slug', bundleSlot: 'food-recipe-detail' },
      { path: 'recipes/:slug/v/:versionNo', bundleSlot: 'food-recipe-version-detail' },
      { path: 'recipes/:slug/edit', bundleSlot: 'food-recipe-edit' },
      { path: 'recipes/:slug/drafts', bundleSlot: 'food-recipe-drafts' },
      { path: 'recipes/:slug/drafts/:draftNo', bundleSlot: 'food-recipe-draft-edit' },
      { path: 'prompts', bundleSlot: 'food-prompt-viewer' },
      { path: 'plan', bundleSlot: 'food-plan' },
      { path: 'fridge', bundleSlot: 'food-fridge' },
      { path: 'solve', bundleSlot: 'food-solve' },
      { path: 'shopping/from-plan', bundleSlot: 'food-shopping-from-plan' },
      { path: 'inbox', bundleSlot: 'food-inbox' },
      { path: 'inbox/:sourceId', bundleSlot: 'food-inbox-inspector' },
    ],
  },
  ai: {
    assetsBaseUrl: '/ai-ui/ai.js',
    nav: {
      id: 'ai',
      label: 'AI',
      labelKey: 'ai',
      icon: 'bot',
      color: 'violet',
      basePath: '/ai',
      order: 70,
      items: [{ path: '', label: 'AI Usage', labelKey: 'ai.usage', icon: 'bar-chart-3' }],
    },
    // All four, including the three that render nothing but a redirect: a
    // loader-mounted pillar gets exactly the pages listed here, so omitting
    // one would make `/ai/rules` a 404 in the e2e and nowhere else.
    pages: [
      { path: '', index: true, bundleSlot: 'ai-usage' },
      { path: 'prompts', bundleSlot: 'ai-prompts' },
      { path: 'config', bundleSlot: 'ai-config' },
      { path: 'rules', bundleSlot: 'ai-rules' },
    ],
  },
  bfm: {
    assetsBaseUrl: '/bfm-ui/bfm.js',
    nav: {
      id: 'bfm',
      label: 'Devices',
      labelKey: 'bfm',
      icon: 'smartphone',
      color: 'indigo',
      basePath: '/bfm',
      order: 80,
      items: [{ path: '', label: 'Devices', labelKey: 'bfm.devices', icon: 'smartphone' }],
    },
    pages: [{ path: '', index: true, bundleSlot: 'bfm-devices' }],
  },
  finance: {
    assetsBaseUrl: '/finance-ui/finance.js',
    nav: {
      id: 'finance',
      label: 'Finance',
      labelKey: 'finance',
      icon: 'dollar-sign',
      color: 'emerald',
      basePath: '/finance',
      order: 10,
      items: [
        { path: '', label: 'Dashboard', labelKey: 'finance.dashboard', icon: 'layout-dashboard' },
        {
          path: '/transactions',
          label: 'Transactions',
          labelKey: 'finance.transactions',
          icon: 'credit-card',
        },
        { path: '/entities', label: 'Entities', labelKey: 'finance.entities', icon: 'building-2' },
        { path: '/budgets', label: 'Budgets', labelKey: 'finance.budgets', icon: 'piggy-bank' },
        { path: '/wishlist', label: 'Wish List', labelKey: 'finance.wishList', icon: 'star' },
        { path: '/import', label: 'Import', labelKey: 'finance.import', icon: 'download' },
        { path: '/rules', label: 'Rules', labelKey: 'finance.rules', icon: 'book-open' },
        {
          path: '/prompts',
          label: 'Prompt Templates',
          labelKey: 'finance.promptTemplates',
          icon: 'file-text',
        },
      ],
    },
    pages: [
      { path: '', index: true, bundleSlot: 'finance-dashboard' },
      { path: 'transactions', bundleSlot: 'finance-transactions' },
      { path: 'entities', bundleSlot: 'finance-entities' },
      { path: 'entities/:id', bundleSlot: 'finance-entity-detail' },
      { path: 'accounts', bundleSlot: 'finance-accounts' },
      { path: 'accounts/:id', bundleSlot: 'finance-account-detail' },
      { path: 'accounts/:id/checkpoints', bundleSlot: 'finance-account-checkpoints' },
      { path: 'budgets', bundleSlot: 'finance-budgets' },
      { path: 'wishlist', bundleSlot: 'finance-wishlist' },
      { path: 'import', bundleSlot: 'finance-import' },
      { path: 'rules', bundleSlot: 'finance-rules' },
      { path: 'tag-rules', bundleSlot: 'finance-tag-rules' },
      { path: 'prompts', bundleSlot: 'finance-prompts' },
      { path: 'settings', bundleSlot: 'finance-settings' },
    ],
  },
  purchases: {
    assetsBaseUrl: '/purchases-ui/purchases.js',
    nav: {
      id: 'purchases',
      label: 'Purchases',
      labelKey: 'purchases',
      icon: 'receipt',
      color: 'rose',
      basePath: '/purchases',
      order: 15,
      items: [
        { path: '', label: 'Reconcile', labelKey: 'purchases.reconcile', icon: 'receipt' },
        {
          path: '/merchants',
          label: 'Merchants',
          labelKey: 'purchases.merchants',
          icon: 'building-2',
        },
        { path: '/receipts', label: 'Receipts', labelKey: 'purchases.receipts', icon: 'file-text' },
        { path: '/products', label: 'Products', labelKey: 'purchases.products', icon: 'package' },
      ],
    },
    pages: [
      { path: '', index: true, bundleSlot: 'purchases-reconcile' },
      { path: 'merchants', bundleSlot: 'purchases-merchants' },
      { path: 'receipts', bundleSlot: 'purchases-receipts' },
      { path: 'products', bundleSlot: 'purchases-products' },
      { path: ':purchaseId', bundleSlot: 'purchases-order' },
    ],
  },
};

/**
 * Answer the boot snapshot fetch with exactly `pillarIds` registered, and the
 * shell manifest with the same set as the operator's selection.
 *
 * A pillar id resolves to mountable UI by advertising `assetsBaseUrl` +
 * `pages` (`LOADER_MOUNTED_UI` above); one that advertises neither is
 * backend-only and contributes no rail entry. Pass `[]` to exercise the
 * never-brick fallback: an empty snapshot degrades to the cached snapshot,
 * and to the shell's own chrome when there is no cache.
 */
export async function stubRegistry(page: Page, pillarIds: readonly string[]): Promise<void> {
  const pillars = pillarIds.map((pillarId) => {
    const manifest = { ...minimalManifest(pillarId), ...LOADER_MOUNTED_UI[pillarId] };
    assertMatchesContract(ManifestPayloadSchema, manifest, `manifest (${pillarId})`);
    return {
      pillarId,
      baseUrl: `http://${pillarId}-api:3000`,
      manifest,
      capabilities: {},
      lastHeartbeatAt: new Date().toISOString(),
    };
  });
  const snapshotBody = { pillars };
  await page.route(
    REGISTRY_SNAPSHOT_URL,
    fulfilWith(200, RegistrySnapshotPayloadSchema, snapshotBody, 'registry snapshot')
  );

  const manifestBody = { apps: [...pillarIds], overlays: [] };
  await page.route(
    SHELL_MANIFEST_URL,
    fulfilWith(200, ShellManifestResponseSchema, manifestBody, 'shell manifest')
  );
}

/**
 * Take the registry off the air, so boot has to fall back.
 *
 * Anchored to the two endpoints rather than the `/registry-api` prefix: in dev
 * the shell's own generated client is served from `/src/registry-api/*.ts`, so
 * a prefix match aborts the app's source modules and the page never mounts at
 * all — which looks exactly like the outage under test and proves nothing.
 */
export async function failRegistry(page: Page): Promise<void> {
  await page.route(REGISTRY_SNAPSHOT_URL, (route) => route.abort('failed'));
  await page.route(SHELL_MANIFEST_URL, (route) => route.abort('failed'));
}

/** Report every pillar in `pillarIds` healthy to `PillarGuard`. */
export async function stubPillarHealth(page: Page, pillarIds: readonly string[]): Promise<void> {
  const bootBody = { pillars: pillarIds.map((id) => ({ id, baseUrl: `http://${id}-api:3000` })) };
  await page.route(
    PILLAR_BOOT_URL,
    fulfilWith(200, PillarBootResponseSchema, bootBody, 'pillar boot')
  );

  const healthBody = { health: Object.fromEntries(pillarIds.map((id) => [id, 'healthy'])) };
  await page.route(
    PILLAR_HEALTH_URL,
    fulfilWith(200, PillarHealthResponseSchema, healthBody, 'pillar health')
  );
}

/** Every pillar this repo ships a UI for. */
export const IN_REPO_PILLARS = [
  'finance',
  'purchases',
  'media',
  'inventory',
  'food',
  'lists',
  'cerebrum',
  'ai',
  'bfm',
] as const;

/**
 * Boot the shell with `pillarIds` registered and healthy. The default is the
 * full in-repo set, which is what a spec about one pillar's page wants: a
 * shell that looks like a normal deploy, with the registry pinned so the
 * result does not depend on which pillars happen to be running.
 */
export async function stubShellBoot(
  page: Page,
  pillarIds: readonly string[] = IN_REPO_PILLARS
): Promise<void> {
  await stubRegistry(page, pillarIds);
  await stubPillarHealth(page, pillarIds);
}

/** One federated-search hit, in the orchestrator's wire shape. */
export interface SearchHit {
  readonly uri: string;
  readonly data: Record<string, unknown>;
}

/** One federated-search section, in the orchestrator's wire shape. */
export interface SearchSection {
  /** Kebab-case domain — also the `section-<domain>` test id the panel renders. */
  readonly domain: string;
  /** Owning module; the shell drops sections for modules it did not mount. */
  readonly moduleId: string;
  readonly hits: readonly SearchHit[];
}

/** The query text `CROSS_MODULE_SEARCH_SECTIONS` is written to answer. */
export const SEARCH_QUERY = 'matrix';

/**
 * One hit owned by `media` and one owned by `finance`, in the orchestrator's
 * wire shape.
 *
 * Shared rather than copied because the comparison between two specs is the
 * claim: the all-modules run asserts both sections reach the panel, and the
 * `POPS_APPS=finance,core` run asserts the same payload arrives with the media
 * section dropped. Two copies that drift are no longer the same payload, and
 * both specs go on passing while the thing they jointly proved quietly stops
 * being true.
 */
export const CROSS_MODULE_SEARCH_SECTIONS: readonly SearchSection[] = [
  {
    domain: 'movies',
    moduleId: 'media',
    hits: [{ uri: 'pops://media/movie/1', data: { title: 'The Matrix', year: 1999 } }],
  },
  {
    domain: 'transactions',
    moduleId: 'finance',
    hits: [
      {
        uri: 'pops://finance/transaction/1',
        data: {
          description: 'MATRIX CINEMA',
          amount: -24.5,
          date: '2026-02-13',
          entityName: 'Event Cinemas',
          type: 'purchase',
        },
      },
    ],
  },
];

/**
 * Answer `POST /orchestrator-api/search` with `sections`, regardless of query
 * text. The shell's own install-set filter still runs over the result, which
 * is what the finance-only spec asserts.
 */
export async function stubOrchestratorSearch(
  page: Page,
  sections: readonly SearchSection[]
): Promise<void> {
  const body = {
    sections: sections.map((section) => ({
      domain: section.domain,
      moduleId: section.moduleId,
      icon: 'Search',
      color: 'emerald',
      isContextSection: false,
      totalCount: section.hits.length,
      hits: section.hits.map((hit, index) => ({
        uri: hit.uri,
        score: 1 - index / 100,
        matchField: 'title',
        matchType: 'exact',
        data: hit.data,
      })),
    })),
  };
  // `parseSearchResponse` is the literal function the search bar's own fetch
  // runs the real response through (`useSearchInputData.tsx`) — reused rather
  // than mirrored, so this stub is exercised by the same guard, not a second
  // one that only proves it agrees with itself. It throws on mismatch.
  parseSearchResponse(body);
  await page.route(ORCHESTRATOR_SEARCH_URL, (route) => json(route, 200, body));
}

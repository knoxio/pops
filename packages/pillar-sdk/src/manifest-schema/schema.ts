import { z } from 'zod';

import { SettingsBlockSchema, type SettingsManifestDescriptor } from './settings.js';
import {
  AssetsBaseUrlSchema,
  CaptureOverlayDescriptorSchema,
  NavConfigDescriptorSchema,
  PageDescriptorSchema,
  type CaptureOverlayDescriptor,
  type NavConfigDescriptor,
  type NavItemDescriptor,
  type PageDescriptor,
} from './ui.js';

const PILLAR_ID = z.string().regex(/^[a-z][a-z0-9-]*$/, 'pillar id must be lowercase kebab-case');

const SEMVER = z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, 'must be semver');

const PROCEDURE_PATH = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*\.[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/,
    'must match <pillar>.<router>.<procedure>'
  );

/**
 * camelCase identifier — used for `ai.tools[].name` and
 * `search.adapters[].name`. No dots, no hyphens. The tool-router composes
 * the qualified name `<pillarId>.<toolName>` at call time. See
 * [ADR-036](../../../../../docs/architecture/adr-036-pillar-id-tool-name-conventions.md)
 * for the rationale and worked examples.
 */
const CAMEL_IDENTIFIER = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'must be camelCase identifier');

const KEBAB_IDENTIFIER = z
  .string()
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'must be lowercase kebab-case identifier');

const URI_TYPE = z
  .string()
  .regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/, 'must be <pillar>/<entity>');

const SETTINGS_KEY = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$/, 'must be dotted.lower.camel');

const CONTRACT_PACKAGE = z
  .string()
  .regex(
    /^@pops\/(?:[a-z-]+-contract|[a-z-]+)$/,
    'must be @pops/<pillar>-contract (legacy split) or @pops/<pillar> (collapsed pillar package)'
  );

const CONTRACT_TAG = z
  .string()
  .regex(/^contract-[a-z-]+@v\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, 'must be contract-<pillar>@v<semver>');

const AI_TOOL = z
  .object({
    name: CAMEL_IDENTIFIER,
    description: z.string().min(10).max(500),
    parameters: z.record(z.string(), z.unknown()),
    allowedUriTypes: z.array(URI_TYPE).optional(),
    requiredScopes: z.array(SETTINGS_KEY).optional(),
  })
  .strict();

/**
 * Event-type identifier convention (ADR-034 / PRD-236).
 *
 * `<source>.<entity>.<action>` — flat dotted namespace shared across every
 * pillar in the federation. Each segment must be lowercase, start with a
 * letter, and contain only `[a-z0-9]`. Examples:
 *
 *     finance.balance.low
 *     media.watch.completed
 *     inventory.item.added
 *
 * Naming discipline is enforced at manifest-validation time so that two
 * pillars cannot accidentally pick the same event type with diverging
 * payload shapes. See
 * [ADR-036](../../../../../docs/architecture/adr-036-pillar-id-tool-name-conventions.md)
 * for the full convention (pillar id + tool name + sink event type).
 */
const SINK_EVENT_TYPE = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/,
    'must match <source>.<entity>.<action> (lowercase dotted)'
  );

const SINK_DESCRIPTOR = z
  .object({
    eventType: SINK_EVENT_TYPE,
    description: z.string().min(10).max(500),
    schema: z.record(z.string(), z.unknown()),
  })
  .strict();

const SINKS = z
  .object({
    descriptors: z.array(SINK_DESCRIPTOR),
  })
  .strict();

const CONTRACT = z
  .object({
    package: CONTRACT_PACKAGE,
    version: SEMVER,
    tag: CONTRACT_TAG,
  })
  .strict();

const ROUTES = z
  .object({
    queries: z.array(PROCEDURE_PATH),
    mutations: z.array(PROCEDURE_PATH),
    subscriptions: z.array(PROCEDURE_PATH).default([]),
  })
  .strict();

const QUERY_SHAPE = z
  .object({
    supportsText: z.boolean(),
    supportsTags: z.boolean(),
    supportsDateRange: z.boolean(),
    supportsScope: z.array(CAMEL_IDENTIFIER),
  })
  .strict();

const SEARCH_ADAPTER = z
  .object({
    name: CAMEL_IDENTIFIER,
    entityType: KEBAB_IDENTIFIER,
    queryShape: QUERY_SHAPE,
    procedurePath: PROCEDURE_PATH,
    rankFieldName: CAMEL_IDENTIFIER.optional(),
  })
  .strict();

const SEARCH = z
  .object({
    adapters: z.array(SEARCH_ADAPTER),
  })
  .strict();

const AI = z
  .object({
    tools: z.array(AI_TOOL),
  })
  .strict();

const URI = z
  .object({
    types: z.array(URI_TYPE),
  })
  .strict();

const CONSUMED_SETTINGS = z
  .object({
    keys: z.array(SETTINGS_KEY),
  })
  .strict();

const HEALTHCHECK = z
  .object({
    path: z.string().regex(/^\//, 'must start with /'),
  })
  .strict();

export const ManifestPayloadSchema = z
  .object({
    pillar: PILLAR_ID,
    version: SEMVER,
    contract: CONTRACT,
    routes: ROUTES,
    search: SEARCH,
    ai: AI,
    sinks: SINKS.optional(),
    uri: URI,
    consumedSettings: CONSUMED_SETTINGS,
    settings: SettingsBlockSchema.optional(),
    nav: NavConfigDescriptorSchema.optional(),
    pages: z.array(PageDescriptorSchema).optional(),
    assetsBaseUrl: AssetsBaseUrlSchema.optional(),
    captureOverlay: CaptureOverlayDescriptorSchema.optional(),
    healthcheck: HEALTHCHECK,
  })
  .strict();

export type SinkDescriptor = z.infer<typeof SINK_DESCRIPTOR>;

export type { SettingsManifestDescriptor };

export type { CaptureOverlayDescriptor, NavConfigDescriptor, NavItemDescriptor, PageDescriptor };

export type ManifestPayload = z.infer<typeof ManifestPayloadSchema>;

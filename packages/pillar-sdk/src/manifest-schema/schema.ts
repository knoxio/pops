import { z } from 'zod';

const PILLAR_ID = z.string().regex(/^[a-z][a-z0-9-]*$/, 'pillar id must be lowercase kebab-case');

const SEMVER = z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, 'must be semver');

const PROCEDURE_PATH = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*\.[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/,
    'must match <pillar>.<router>.<procedure>'
  );

const CAMEL_IDENTIFIER = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'must be camelCase identifier');

const URI_TYPE = z
  .string()
  .regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/, 'must be <pillar>/<entity>');

const SETTINGS_KEY = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$/, 'must be dotted.lower.camel');

const CONTRACT_PACKAGE = z
  .string()
  .regex(/^@pops\/[a-z-]+-contract$/, 'must be @pops/<pillar>-contract');

const CONTRACT_TAG = z
  .string()
  .regex(/^contract-[a-z-]+@v\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, 'must be contract-<pillar>@v<semver>');

const AI_TOOL = z
  .object({
    name: CAMEL_IDENTIFIER,
    description: z.string().min(10).max(500),
    parameters: z.record(z.string(), z.unknown()),
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

const SEARCH = z
  .object({
    adapters: z.array(CAMEL_IDENTIFIER),
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

const SETTINGS = z
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
    uri: URI,
    settings: SETTINGS,
    healthcheck: HEALTHCHECK,
  })
  .strict();

export type ManifestPayload = z.infer<typeof ManifestPayloadSchema>;

import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/** A single persisted setting on the wire (`{ key, value }`). */
export const SettingSchema = z.object({ key: z.string(), value: z.string() });

const SettingValueBody = z.object({ value: z.string() });
const GetManyInput = z.object({ keys: z.array(z.string()) });
const GetManyOutput = z.object({ settings: z.record(z.string(), z.string()) });
const SetManyInput = z.object({ entries: z.array(SettingSchema) });
const SetManyOutput = z.object({ settings: z.record(z.string(), z.string()) });
const ResetInput = z.object({ keys: z.array(z.string()).optional() });
const ResetOutput = z.object({
  reset: z.array(z.string()),
  settings: z.record(z.string(), z.string()),
});

/**
 * A map of HTTP error status → response body schema, injected so the
 * package carries no dependency on any pillar's shared error set. Core
 * passes its `AUTH_ERR_RESPONSES`.
 */
export type ContractErrorResponses = Readonly<Record<number, z.ZodType>>;

const readRoutes = <P extends z.ZodTypeAny>(keyParam: P, err: ContractErrorResponses) =>
  ({
    list: {
      method: 'GET',
      path: '/settings',
      responses: { 200: z.object({ data: z.array(SettingSchema) }), ...err },
      summary: 'List effective values for every declared key (sensitive redacted)',
    },
    get: {
      method: 'GET',
      path: '/settings/:key',
      pathParams: keyParam,
      responses: { 200: z.object({ data: SettingSchema.nullable() }), ...err },
      summary: 'Read a single setting (null on unset; sensitive redacted)',
    },
    getMany: {
      method: 'POST',
      path: '/settings/get-many',
      body: GetManyInput,
      responses: { 200: GetManyOutput, ...err },
      summary: 'Batch-read settings by key (missing omitted; sensitive redacted)',
    },
  }) as const;

const writeRoutes = <P extends z.ZodTypeAny>(keyParam: P, err: ContractErrorResponses) =>
  ({
    set: {
      method: 'PUT',
      path: '/settings/:key',
      pathParams: keyParam,
      body: SettingValueBody,
      responses: { 200: z.object({ data: SettingSchema, message: z.string() }), ...err },
      summary: 'Upsert a single declared setting',
    },
    setMany: {
      method: 'POST',
      path: '/settings/set-many',
      body: SetManyInput,
      responses: { 200: SetManyOutput, ...err },
      summary: 'Transactional batch write (all-or-nothing); returns the written mirror',
    },
  }) as const;

const resetRoutes = <P extends z.ZodTypeAny>(keyParam: P, err: ContractErrorResponses) =>
  ({
    resetKey: {
      method: 'POST',
      path: '/settings/:key/reset',
      pathParams: keyParam,
      body: z.object({}).optional(),
      responses: { 200: z.object({ data: SettingSchema, message: z.string() }), ...err },
      summary: 'Reset a single setting to its manifest default',
    },
    reset: {
      method: 'POST',
      path: '/settings/reset',
      body: ResetInput,
      responses: { 200: ResetOutput, ...err },
      summary: 'Reset declared keys to defaults (omit keys ⇒ reset all)',
    },
    ensure: {
      method: 'POST',
      path: '/settings/:key/ensure',
      pathParams: keyParam,
      body: SettingValueBody,
      responses: { 200: z.object({ data: SettingSchema }), ...err },
      summary: 'Internal-only write-once seed (encryption seed / client id)',
    },
  }) as const;

/**
 * Builds the federated RU+reset ts-rest router for one pillar. `:key` is
 * constrained to that pillar's declared key enum; `getMany`/`setMany`
 * accept free-form keys (matching the bulk service shape).
 *
 * Verbs: `list` (collection), `get` (single, null on unset), `getMany`
 * (batch read), `set` (single upsert), `setMany` (transactional batch),
 * `resetKey`/`reset` (single + batch reset-to-default), and the
 * INTERNAL-ONLY `ensure` write-once seed. There is deliberately NO
 * create and NO delete verb — keys are a fixed declared set.
 *
 * operationIds project to the dot-form (`settings.list`, `settings.get`,
 * …) so polyglot pillars (the Rust crate) derive identical client method
 * names.
 */
type KeyParamSchema<KeyEnum extends [string, ...string[]]> = z.ZodObject<{
  key: z.ZodEnum<{ [K in KeyEnum[number]]: K }>;
}>;

/** The composed RU+reset route map for a given key enum. */
export type SettingsContract<KeyEnum extends [string, ...string[]]> = ReturnType<
  typeof readRoutes<KeyParamSchema<KeyEnum>>
> &
  ReturnType<typeof writeRoutes<KeyParamSchema<KeyEnum>>> &
  ReturnType<typeof resetRoutes<KeyParamSchema<KeyEnum>>>;

export function makeSettingsContract<KeyEnum extends [string, ...string[]]>(
  keyValues: KeyEnum,
  errorResponses: ContractErrorResponses
): SettingsContract<KeyEnum> {
  const keyParam = z.object({ key: z.enum(keyValues) });
  return c.router({
    ...readRoutes(keyParam, errorResponses),
    ...writeRoutes(keyParam, errorResponses),
    ...resetRoutes(keyParam, errorResponses),
  });
}

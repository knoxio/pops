/**
 * OpenAPI generator for `@pops/food` — projects the ts-rest contract in
 * `src/contract/rest.ts` to a static `openapi/food.openapi.json`.
 *
 * The contract is the canonical declaration of the food wire surface; this
 * script is a pure projection of it. Polyglot consumers (iOS Swift, Rust)
 * consume the JSON directly; TS consumers feed it through
 * `openapi-typescript` (see `generate-api-types.ts`).
 *
 * Output is deterministic (recursively sorted keys + oxfmt pass) so the
 * `pnpm generate:openapi && git diff --exit-code` drift check is stable.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateOpenApi } from '@ts-rest/open-api';
import { z } from 'zod';

import { foodContract } from '../src/contract/rest.js';

type OpenApiSchema = Record<string, unknown>;

/**
 * Custom schema transformer for zod 4 — the bundled
 * `ZOD_3_SCHEMA_TRANSFORMER` uses `@anatine/zod-openapi` which only knows
 * zod 3 and emits empty schemas under zod 4. zod 4 ships its own
 * `z.toJSONSchema`; we strip the JSON-Schema draft marker so the output is
 * OpenAPI 3.0-safe.
 */
function isZodType(value: unknown): value is z.ZodType {
  return value !== null && typeof value === 'object' && '_zod' in value && 'parse' in value;
}

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  const raw = z.toJSONSchema(schema, { target: 'openapi-3.0' }) as Record<string, unknown>;
  const { $schema: _ignored, ...rest } = raw;
  return rest;
}

function foodSchemaTransformer({ schema }: { schema: unknown }): OpenApiSchema | null {
  if (isZodType(schema)) return zodToOpenApiSchema(schema);
  return null;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = resolve(HERE, '..', 'package.json');
const PACKAGE_JSON: { version?: string } = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
const CONTRACT_VERSION = PACKAGE_JSON.version ?? '0.0.0';

/**
 * zod 4 emits recursive schemas as a nested `definitions` block with
 * root-relative `#/definitions/<id>` refs. Those dangle for OpenAPI
 * consumers (the defs live under a response schema, not the document
 * root). Hoist every nested `definitions` / `$defs` entry into the
 * document-level `components.schemas` and rewrite the refs accordingly.
 * Stable `.meta({ id })` names keep this deterministic for the drift check.
 */
function hoistDefinitions(doc: Record<string, unknown>): void {
  const components = (doc['components'] ??= {}) as Record<string, unknown>;
  const schemas = (components['schemas'] ??= {}) as Record<string, unknown>;
  const DEF_KEYS = ['definitions', '$defs'];

  const collect = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    for (const key of DEF_KEYS) {
      const defs = obj[key];
      if (defs !== null && typeof defs === 'object') {
        for (const [name, schema] of Object.entries(defs as Record<string, unknown>)) {
          schemas[name] = schema;
        }
        delete obj[key];
      }
    }
    for (const value of Object.values(obj)) collect(value);
  };

  const rewrite = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(rewrite);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (typeof obj['$ref'] === 'string') {
      obj['$ref'] = obj['$ref']
        .replace('#/definitions/', '#/components/schemas/')
        .replace('#/$defs/', '#/components/schemas/');
    }
    for (const value of Object.values(obj)) rewrite(value);
  };

  collect(doc['paths']);
  rewrite(doc);
}

function sortJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const entries = value as Record<string, unknown>;
    const sortedKeys = Object.keys(entries).toSorted();
    const sorted: Record<string, unknown> = {};
    for (const key of sortedKeys) sorted[key] = sortJson(entries[key]);
    return sorted as T;
  }
  return value;
}

function main(): void {
  const document = generateOpenApi(
    foodContract,
    {
      info: {
        title: '@pops/food',
        description:
          "OpenAPI projection of the food pillar's REST contract. " +
          'Authored as a ts-rest contract (src/contract/rest.ts); ' +
          'consumed directly by polyglot clients and via ' +
          'openapi-typescript by TS consumers.',
        version: CONTRACT_VERSION,
      },
    },
    {
      schemaTransformer: foodSchemaTransformer,
      setOperationId: 'concatenated-path',
    }
  );
  hoistDefinitions(document as unknown as Record<string, unknown>);
  const sorted = sortJson(document);
  const serialized = `${JSON.stringify(sorted, null, 2)}\n`;

  const outFile = resolve(HERE, '..', 'openapi', 'food.openapi.json');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, serialized, 'utf8');

  execFileSync('pnpm', ['exec', 'oxfmt', '--write', outFile], {
    cwd: resolve(HERE, '..'),
    stdio: 'inherit',
  });

  process.stdout.write(`[food] wrote OpenAPI projection to ${outFile}\n`);
}

main();

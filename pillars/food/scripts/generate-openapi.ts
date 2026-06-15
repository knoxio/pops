/**
 * OpenAPI generator for `@pops/food-contract` (Theme 13 PRD-153 US-04).
 *
 * Why this script is hand-rolled rather than using `trpc-to-openapi`:
 *
 * The food pillar's tRPC router (which will eventually live in
 * `@pops/food-api`) is intentionally tRPC-only — adding
 * `.meta({ openapi: { ... } })` to every procedure would be a separate,
 * invasive change touching every router file in food-api and would
 * require wiring `OpenApiMeta` into the trpc builder. That is option
 * (a) from PRD-153's investigation guidance and out of scope here.
 *
 * Instead we take option (c): hand-build a minimal OpenAPI snapshot from
 * the contract's own Zod schemas. The contract package is already the
 * canonical declaration of the public wire shape (PRD-153), so deriving
 * the spec from it is consistent with the package's design.
 *
 * Drift detection vs the live router is intentionally NOT part of this
 * script — PRD-154's drift-check CI job will own it. Importing the live
 * `foodRouter` here would pull the entire food-api runtime graph
 * (`@pops/food-db`, drizzle, …) into the contract's build step, which
 * defeats the "contract has no runtime dependencies on pillar packages"
 * rule from PRD-153.
 *
 * Output:
 *   - OpenAPI 3.x JSON written to `openapi/food.openapi.json`
 *   - Deterministic key order (alphabetical recursively) so future drift
 *     diffs are stable irrespective of object-insertion order changes
 *   - Trailing newline so `git diff` is happy
 *
 * iOS Swift codegen (different theme) consumes this committed file.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPaths } from './openapi-paths.js';
import { buildComponentSchemas } from './openapi-schemas.js';

import type { OpenApiDocument } from './openapi-types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = resolve(HERE, '..', 'package.json');
const PACKAGE_JSON: { version?: string } = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
const CONTRACT_VERSION = PACKAGE_JSON.version ?? '0.0.0';

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

function buildDocument(): OpenApiDocument {
  return {
    openapi: '3.0.3',
    info: {
      title: '@pops/food',
      description:
        "OpenAPI snapshot of the food pillar's public wire surface. " +
        "Derived from the contract's Zod schemas. Consumed by iOS Swift " +
        'codegen.',
      version: CONTRACT_VERSION,
    },
    servers: [{ url: '/api/v1', description: 'Food pillar API' }],
    tags: [{ name: 'recipes', description: 'Food recipes' }],
    paths: buildPaths(),
    components: { schemas: buildComponentSchemas() },
  };
}

function main(): void {
  const document = sortJson(buildDocument());
  const serialized = `${JSON.stringify(document, null, 2)}\n`;

  const outFile = resolve(HERE, '..', 'openapi', 'food.openapi.json');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, serialized, 'utf8');
  process.stdout.write(`[food-contract] wrote OpenAPI snapshot to ${outFile}\n`);
}

main();

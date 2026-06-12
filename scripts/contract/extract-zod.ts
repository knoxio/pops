/**
 * Zod-schema surface extractor for contract packages.
 *
 * Strategy: dynamically `import()` the package's built `schemas` entry
 * point, enumerate exports whose value is a Zod schema (duck-typed via
 * the `_def` shape), and emit a normalised JSON document via
 * `z.toJSONSchema(...)`. The resulting JSON is stable, structural and
 * doesn't drift on insignificant ordering or library-internal field
 * additions, which matches our diff requirement.
 *
 * Why `z.toJSONSchema` instead of raw `_def`: raw `_def` contains
 * function references and ordering noise; toJSONSchema is the
 * library-blessed serialiser. Breaking-change classification on the
 * emitted JSON Schema is straightforward:
 *
 *   - additive: a new optional property; a new enum value; a widened
 *     numeric range; a new top-level schema.
 *   - breaking: a new required property; a removed enum value; a
 *     narrowed numeric range; a removed property; a tightened pattern.
 *
 * The diff classifier lives in `diff-zod.ts`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import type { ZodSurface, ZodSurfaceEntry } from './types.js';

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly exports?: Record<string, { default?: string } | string>;
}

function readPackageJson(packageDir: string): PackageManifest {
  const raw = readFileSync(resolve(packageDir, 'package.json'), 'utf8');
  return JSON.parse(raw) as PackageManifest;
}

function resolveSchemasEntry(packageDir: string, pkg: PackageManifest): string {
  const fromExports = pkg.exports?.['./schemas'];
  if (fromExports && typeof fromExports !== 'string' && fromExports.default) {
    return resolve(packageDir, fromExports.default);
  }
  return resolve(packageDir, 'dist/schemas/index.js');
}

function isZodSchema(value: unknown): value is z.ZodType {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { _def?: unknown };
  if (typeof candidate._def !== 'object' || candidate._def === null) return false;
  const def = candidate._def as { type?: unknown };
  return typeof def.type === 'string';
}

export async function extractZodSurface(packageDir: string): Promise<ZodSurface> {
  const pkg = readPackageJson(packageDir);
  const schemasEntry = resolveSchemasEntry(packageDir, pkg);

  const mod = (await import(pathToFileURL(schemasEntry).href)) as Record<string, unknown>;

  const entries: ZodSurfaceEntry[] = [];
  for (const [name, value] of Object.entries(mod)) {
    if (!isZodSchema(value)) continue;
    const jsonSchema = z.toJSONSchema(value, { unrepresentable: 'any' });
    entries.push({ name, schema: jsonSchema });
  }

  entries.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  return {
    contract: pkg.name,
    version: pkg.version,
    entries,
  };
}

export function serialiseZodSurface(surface: ZodSurface): string {
  return `${JSON.stringify(surface, null, 2)}\n`;
}

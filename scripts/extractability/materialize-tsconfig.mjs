#!/usr/bin/env node
/**
 * EX-2 helper — make a sandboxed unit's tsconfig self-contained.
 *
 * In the monorepo a unit's tsconfig.json extends a repo-root base
 * (`../../tsconfig.base.json`). Once the unit is copied out for isolation that
 * base is no longer reachable, so the extends must be MATERIALISED: the full
 * extends chain is resolved (via the TS config parser) and the effective
 * compilerOptions are inlined into the copied tsconfig, with any out-of-unit
 * `extends` removed. Local (in-unit) `extends` are preserved as-is.
 *
 * This mirrors exactly what a real extracted repo carries: its own complete
 * tsconfig, not a dangling reference to a monorepo root. It does NOT change any
 * actual compiler setting — it just freezes the resolved values in place.
 *
 * Usage: node scripts/extractability/materialize-tsconfig.mjs <sandbox-unit-dir> <original-unit-dir>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import ts from 'typescript';

import { toStringArray } from './lib.mjs';

/** @param {string[]} argv */
function main(argv) {
  const [sandboxDir, originalDir] = argv;
  if (!sandboxDir || !originalDir) {
    process.stderr.write(
      'usage: materialize-tsconfig.mjs <sandbox-unit-dir> <original-unit-dir>\n'
    );
    return 2;
  }

  let materialised = 0;
  for (const name of ['tsconfig.json', 'tsconfig.build.json']) {
    const sandboxConfig = join(sandboxDir, name);
    const originalConfig = join(originalDir, name);
    if (!existsSync(sandboxConfig) || !existsSync(originalConfig)) continue;
    let touched = materialiseOne(sandboxConfig, originalConfig);
    touched = stripExternalReferences(sandboxConfig) || touched;
    if (touched) materialised += 1;
  }
  process.stdout.write(`materialised ${materialised} tsconfig file(s) in ${sandboxDir}\n`);
  return 0;
}

/**
 * @param {string} sandboxConfig path to the copied tsconfig (rewritten in place)
 * @param {string} originalConfig path to the in-repo tsconfig (used to resolve the real chain)
 * @returns {boolean} whether an out-of-unit extends was inlined
 */
function materialiseOne(sandboxConfig, originalConfig) {
  const raw = readConfigJson(sandboxConfig);
  if (!raw) return false;

  const extendsList = toStringArray(raw.extends);

  // Determine which extends targets point outside the unit (the ones that won't
  // exist in the sandbox). Local relative extends to a sibling in-unit config
  // are kept untouched.
  const unitDir = dirname(sandboxConfig);
  const outOfUnit = extendsList.filter((ext) => isOutsideUnit(unitDir, ext));
  if (outOfUnit.length === 0) return false;

  // Resolve the fully-merged compilerOptions from the ORIGINAL location (where
  // the chain is intact), then inline them.
  const resolved = ts.parseJsonConfigFileContent(
    readConfigJson(originalConfig) ?? {},
    ts.sys,
    dirname(originalConfig)
  );

  const inlinedOptions = serialisableCompilerOptions(resolved.options, dirname(originalConfig));

  // Keep only in-unit extends; merge inherited options UNDER the unit's own
  // explicit options so local overrides still win.
  const keptExtends = extendsList.filter((ext) => !isOutsideUnit(unitDir, ext));
  const ownOptions =
    raw.compilerOptions && typeof raw.compilerOptions === 'object' ? raw.compilerOptions : {};
  raw.compilerOptions = { ...inlinedOptions, ...ownOptions };
  if (keptExtends.length === 0) delete raw.extends;
  else raw.extends = keptExtends.length === 1 ? keptExtends[0] : keptExtends;

  writeFileSync(sandboxConfig, `${JSON.stringify(raw, null, 2)}\n`);
  return true;
}

/**
 * Drops TS project `references` whose path resolves outside the unit. In an
 * extracted repo a sibling unit is consumed as an installed package (its packed
 * `.d.ts`), not as a composite project reference — so those references can't and
 * shouldn't resolve. In-unit references (rare) are kept.
 * @param {string} sandboxConfig
 * @returns {boolean} whether any reference was removed
 */
function stripExternalReferences(sandboxConfig) {
  const raw = readConfigJson(sandboxConfig);
  if (!raw || !Array.isArray(raw.references)) return false;
  const unitDir = dirname(sandboxConfig);
  const kept = raw.references.filter(
    (r) => r && typeof r.path === 'string' && !isOutsideUnit(unitDir, r.path)
  );
  if (kept.length === raw.references.length) return false;
  if (kept.length === 0) delete raw.references;
  else raw.references = kept;
  writeFileSync(sandboxConfig, `${JSON.stringify(raw, null, 2)}\n`);
  return true;
}

/** @param {string} unitDir @param {string} ext */
function isOutsideUnit(unitDir, ext) {
  if (!ext.startsWith('.')) return true; // package extends (e.g. @tsconfig/…) — also out of unit
  const target = join(unitDir, ext);
  return !target.startsWith(unitDir + '/') && target !== unitDir;
}

/** @param {string} file */
function readConfigJson(file) {
  try {
    const parsed = ts.parseConfigFileTextToJson(file, readFileSync(file, 'utf8'));
    if (parsed.error || !parsed.config) return null;
    return parsed.config;
  } catch {
    return null;
  }
}

/**
 * Reduces resolved ts.CompilerOptions back to a JSON-serialisable, path-free
 * subset suitable for inlining. Drops path-bearing and project-internal options
 * (the sandbox sets its own outDir/rootDir via the unit's existing config) and
 * normalises enum-valued options back to their string form.
 *
 * @param {import('typescript').CompilerOptions} options
 * @param {string} _baseDir
 */
function serialisableCompilerOptions(options, _baseDir) {
  /** @type {Record<string, unknown>} */
  const out = {};
  const drop = new Set([
    'configFilePath',
    'outDir',
    'rootDir',
    'baseUrl',
    'paths',
    'project',
    'tsBuildInfoFile',
    'composite',
    'declarationDir',
  ]);
  for (const [key, value] of Object.entries(options)) {
    if (drop.has(key)) continue;
    if (value === undefined) continue;
    const normalised = normaliseOption(key, value);
    if (normalised !== undefined) out[key] = normalised;
  }
  return out;
}

/** @param {string} key @param {unknown} value */
function normaliseOption(key, value) {
  if (key === 'target' && typeof value === 'number') return ts.ScriptTarget[value]?.toLowerCase();
  if (key === 'module' && typeof value === 'number') return ts.ModuleKind[value];
  if (key === 'moduleResolution' && typeof value === 'number')
    return ts.ModuleResolutionKind[value];
  if (key === 'jsx' && typeof value === 'number') return ts.JsxEmit[value];
  if (key === 'lib' && Array.isArray(value)) return value;
  if (Array.isArray(value) || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  return undefined;
}

process.exit(main(process.argv.slice(2)));

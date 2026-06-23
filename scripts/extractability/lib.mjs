/**
 * Shared helpers for the extractability litmus tooling (EX-1/EX-2/EX-3).
 *
 * The load-bearing idea: a unit is "extractable" only if everything it imports
 * in source is declared in its own package.json. pnpm's hoisting hides missing
 * deps in-workspace ("workspace bleed"); these helpers surface them by parsing
 * actual import specifiers (via the TypeScript AST, not regex) and diffing them
 * against the unit's declared dependency surface.
 */
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative, sep } from 'node:path';

import ts from 'typescript';

const { SyntaxKind } = ts;

/** Node built-ins are always available post-extraction; never flagged. */
const NODE_BUILTINS = new Set(builtinModules);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '.turbo']);

/**
 * Roots scanned for units. A "unit" is any directory holding a package.json
 * (so pillar `app/` sub-packages and nested units are included), excluding
 * node_modules.
 */
export const UNIT_ROOTS = ['libs', 'pillars'];

/**
 * @typedef {{ dir: string, name: string, pkg: Record<string, unknown> }} Unit
 */

/**
 * Reads and parses a package.json, returning null if absent or unparseable.
 * @param {string} dir
 * @returns {Record<string, unknown> | null}
 */
export function readPackageJson(dir) {
  const file = join(dir, 'package.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Discovers every TS/JS unit under the given roots (recursively, but never
 * descending into node_modules / build output). Each directory containing a
 * package.json with a name is a unit.
 *
 * Rust-only units (Cargo.toml, no package.json) are intentionally skipped —
 * they are handled by the cargo lane (RUST-*).
 *
 * @param {string[]} [roots]
 * @param {string} [cwd]
 * @returns {Unit[]}
 */
export function discoverUnits(roots = UNIT_ROOTS, cwd = process.cwd()) {
  /** @type {Unit[]} */
  const units = [];
  /** @param {string} dir */
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const pkg = readPackageJson(dir);
    if (pkg && typeof pkg.name === 'string') {
      units.push({ dir, name: pkg.name, pkg });
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      walk(join(dir, entry.name));
    }
  };
  for (const root of roots) {
    const abs = join(cwd, root);
    if (existsSync(abs)) walk(abs);
  }
  return units.toSorted((a, b) => a.dir.localeCompare(b.dir));
}

/**
 * Reduces an import specifier to its installable package root.
 *  - `@scope/name/sub/path` -> `@scope/name`
 *  - `name/sub/path`        -> `name`
 *  - relative / absolute / builtin / protocol -> null (not a package)
 *
 * @param {string} specifier
 * @returns {string | null}
 */
export function packageRoot(specifier) {
  if (!specifier) return null;
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) return null; // node:, data:, http:, file: …
  const segments = specifier.split('/');
  if (specifier.startsWith('@')) {
    if (segments.length < 2 || !segments[0] || !segments[1]) return null;
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0] || null;
}

/**
 * Normalises a tsconfig `extends` field (string | string[] | undefined) into a
 * flat string array.
 * @param {unknown} value
 * @returns {string[]}
 */
export function toStringArray(value) {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

/** @param {string} filePath */
function scriptKindFor(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(mts|cts|ts)$/.test(filePath)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/**
 * Extracts every external module specifier referenced by a source file, using
 * the TypeScript AST so every import form is covered:
 *   - `import x from 'pkg'` / `import 'pkg'` / `import type {…} from 'pkg'`
 *   - `export … from 'pkg'`
 *   - `import x = require('pkg')`
 *   - `import('pkg')` dynamic
 *   - `require('pkg')` (in .cjs/.js)
 *   - `/// <reference types="pkg" />`
 *
 * Returns package roots only (a subpath import `@pops/sdk/client` yields
 * `@pops/sdk`), since that is what package.json declares.
 *
 * @param {string} filePath
 * @returns {Set<string>}
 */
export function importedPackages(filePath) {
  /** @type {Set<string>} */
  const roots = new Set();
  let source;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    return roots;
  }
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKindFor(filePath)
  );

  for (const ref of sourceFile.typeReferenceDirectives ?? []) {
    const root = packageRoot(ref.fileName);
    if (root) roots.add(root);
  }

  /** @param {import('typescript').Node} node */
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const root = packageRoot(node.moduleSpecifier.text);
      if (root) roots.add(root);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      const root = packageRoot(node.moduleReference.expression.text);
      if (root) roots.add(root);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === SyntaxKind.ImportKeyword;
      const isRequire =
        ts.isIdentifier(node.expression) && ts.idText(node.expression) === 'require';
      if ((isDynamicImport || isRequire) && node.arguments.length > 0) {
        const [arg] = node.arguments;
        if (ts.isStringLiteral(arg)) {
          const root = packageRoot(arg.text);
          if (root) roots.add(root);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return roots;
}

/**
 * Collects TypeScript path-alias patterns declared in a unit's tsconfig
 * (following the `extends` chain). Aliases like `@/*` -> `./src/*` resolve to
 * the unit's OWN source — they are not external packages and must never be
 * reported as phantom deps. Returns a matcher: given an import specifier, true
 * if it matches a declared alias.
 *
 * @param {string} unitDir
 * @returns {(specifier: string) => boolean}
 */
export function tsconfigAliasMatcher(unitDir) {
  /** @type {RegExp[]} */
  const patterns = [];
  /** @type {Set<string>} */
  const visited = new Set();

  /** @param {string} configPath */
  const load = (configPath) => {
    if (visited.has(configPath) || !existsSync(configPath)) return;
    visited.add(configPath);
    let json;
    try {
      const parsed = ts.parseConfigFileTextToJson(configPath, readFileSync(configPath, 'utf8'));
      if (parsed.error || !parsed.config) return;
      json = parsed.config;
    } catch {
      return;
    }
    const paths = json?.compilerOptions?.paths;
    if (paths && typeof paths === 'object') {
      for (const key of Object.keys(paths)) {
        patterns.push(aliasKeyToRegExp(key));
      }
    }
    for (const ext of toStringArray(json.extends)) {
      if (ext.startsWith('.')) {
        load(resolveTsExtends(configPath, ext));
      }
    }
  };

  for (const name of ['tsconfig.json', 'tsconfig.build.json']) {
    load(join(unitDir, name));
  }
  return (specifier) => patterns.some((re) => re.test(specifier));
}

/** @param {string} configPath @param {string} ext */
function resolveTsExtends(configPath, ext) {
  const base = join(configPath, '..', ext);
  return /\.json$/.test(base) ? base : `${base}.json`;
}

/**
 * Converts a tsconfig paths key (`@/*`, `@app/*`, `exact`) into a RegExp that
 * matches import specifiers resolving through that alias.
 * @param {string} key
 */
function aliasKeyToRegExp(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withWildcard = escaped.replace(/\\\*/g, '.*');
  return new RegExp(`^${withWildcard}$`);
}

/** @param {string} name */
function isTestFile(name) {
  return /\.(test|spec|test-d|stories)\.[a-z]+$/.test(name) || /^vitest\.config\./.test(name);
}

/** @param {string} filePath */
function baseName(filePath) {
  const idx = filePath.lastIndexOf(sep);
  return idx < 0 ? filePath : filePath.slice(idx + 1);
}

/**
 * Lists every source file in a unit, preferring a conventional `src/` root and
 * falling back to the whole unit when absent (config-/data-only packages).
 * Build output, node_modules and nested units are never walked. Declaration
 * files (`*.d.ts`) are skipped.
 *
 * @param {string} unitDir
 * @returns {string[]}
 */
export function sourceFiles(unitDir) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} dir */
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        if (dir !== unitDir && existsSync(join(full, 'package.json'))) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const dot = entry.name.lastIndexOf('.');
      if (dot < 0) continue;
      if (/\.d\.ts$/.test(entry.name)) continue;
      if (!SOURCE_EXTENSIONS.has(entry.name.slice(dot))) continue;
      files.push(full);
    }
  };
  const srcDir = join(unitDir, 'src');
  walk(existsSync(srcDir) ? srcDir : unitDir);
  return files.toSorted();
}

/**
 * The set of package names a unit declares it may import — the union of
 * dependencies, peerDependencies, optionalDependencies and devDependencies.
 *
 * devDependencies count: a unit that imports a test helper only in `*.test.ts`
 * legitimately keeps it in devDeps and still ships fine (tests aren't packed).
 * EX-1 only asserts *some* declaration exists; EX-2 (sandbox) is the runtime
 * proof that runtime deps specifically resolve.
 *
 * @param {Record<string, unknown>} pkg
 * @returns {Set<string>}
 */
export function declaredDependencies(pkg) {
  const names = new Set();
  for (const field of [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
    'devDependencies',
  ]) {
    const block = pkg[field];
    if (block && typeof block === 'object') {
      for (const key of Object.keys(block)) names.add(key);
    }
  }
  return names;
}

/**
 * @typedef {{ pkg: string, files: string[] }} Phantom
 */

/**
 * Computes the phantom (used-but-undeclared) packages for a single unit.
 *
 * A phantom is any external package root imported in the unit's source that is
 * neither (a) a Node builtin, (b) the unit's own package name (self import),
 * nor (c) declared in any dependency field. Both `@pops/*` and external
 * phantoms are reported — an undeclared external breaks extraction just as hard.
 *
 * @param {Unit} unit
 * @param {{ includeTests?: boolean }} [options]
 * @returns {{ phantoms: Phantom[], scanned: number }}
 */
export function findPhantomDeps(unit, options = {}) {
  const includeTests = options.includeTests ?? false;
  const declared = declaredDependencies(unit.pkg);
  const isAlias = tsconfigAliasMatcher(unit.dir);
  const files = sourceFiles(unit.dir).filter((f) => includeTests || !isTestFile(baseName(f)));
  /** @type {Map<string, Set<string>>} */
  const phantomToFiles = new Map();
  for (const file of files) {
    for (const pkg of importedPackages(file)) {
      if (NODE_BUILTINS.has(pkg)) continue;
      if (pkg === unit.name) continue;
      if (declared.has(pkg)) continue;
      if (isAlias(pkg)) continue;
      const bucket = phantomToFiles.get(pkg) ?? new Set();
      bucket.add(file);
      phantomToFiles.set(pkg, bucket);
    }
  }
  const phantoms = [...phantomToFiles.entries()]
    .map(([pkg, fileSet]) => ({ pkg, files: [...fileSet].toSorted() }))
    .toSorted((a, b) => a.pkg.localeCompare(b.pkg));
  return { phantoms, scanned: files.length };
}

/**
 * Normalises a user-supplied unit path ("libs/types", "./libs/types/",
 * absolute) into a Unit, or throws if it isn't a JS/TS unit.
 *
 * @param {string} input
 * @param {string} [cwd]
 * @returns {Unit}
 */
export function resolveUnit(input, cwd = process.cwd()) {
  const trimmed = input.replace(/\/+$/, '');
  const dir = trimmed.startsWith('/') ? trimmed : join(cwd, trimmed);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`unit directory not found: ${input}`);
  }
  const pkg = readPackageJson(dir);
  if (!pkg) {
    if (existsSync(join(dir, 'Cargo.toml'))) {
      throw new Error(`${input} is a Rust crate (no package.json) — use the cargo lane, not EX-1`);
    }
    throw new Error(`${input} has no package.json — not a JS/TS unit`);
  }
  if (typeof pkg.name !== 'string') {
    throw new Error(`${input}/package.json has no "name" field`);
  }
  return { dir, name: pkg.name, pkg };
}

/** @param {string} from @param {string} to */
export function rel(from, to) {
  const r = relative(from, to);
  return r === '' ? '.' : r;
}

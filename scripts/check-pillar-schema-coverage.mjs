#!/usr/bin/env node
/**
 * Pillar schema coverage guard.
 *
 * Post lake-migration the per-pillar `*-db` packages were collapsed into
 * the pillars themselves: a pillar at `pillars/<x>` owns its schema under
 * `pillars/<x>/src/db/schema/**`, its services under
 * `pillars/<x>/src/db/services/**`, its migrations journal under
 * `pillars/<x>/migrations/`, and exposes an `open<Pillar>Db()` opener from
 * its built `dist/db/index.js`. Tables that more than one pillar persists
 * (e.g. `entities`, `aiInferenceLog`) are no longer shared via a package —
 * each pillar owns a byte-compatible local copy under
 * `pillars/<x>/src/db/schema/**` and surfaces it through its
 * `src/db/schema.ts` barrel.
 *
 * For each discovered pillar:
 *   1. Open a fresh SQLite DB (temp file — `:memory:` is incompatible
 *      with the pillar opener's `journal_mode=WAL` pragma).
 *   2. Apply the pillar's migrations journal via its `open<Pillar>Db()`
 *      export (discovered dynamically from `dist/db/index.js`).
 *   3. Walk `src/db/services/**`, collect every table symbol imported from
 *      the pillar's schema barrel (`.../schema.js`) or a specific schema
 *      module (`.../schema/<name>.js`).
 *   4. Map each symbol to its physical table name + expected index list
 *      (parsed from the pillar's own `src/db/schema/**`).
 *   5. Assert every expected table exists in `sqlite_master`. Assert every
 *      expected index exists.
 *   6. Exit non-zero with a precise diff if anything is missing.
 *
 * This catches the systemic gap that let Track N4 (#2908) merge with a
 * latent "no such table" because the migration baseline was never
 * extended.
 *
 * The pillar set is derived from disk (every `pillars/<x>` that exposes a
 * `src/db/schema.ts` barrel) — there is no hard-coded pillar list.
 *
 * Usage:
 *   node scripts/check-pillar-schema-coverage.mjs --pillar finance
 *   node scripts/check-pillar-schema-coverage.mjs --all
 *   node scripts/check-pillar-schema-coverage.mjs --pillar finance --ignore-allowlist
 *   node scripts/check-pillar-schema-coverage.mjs --pillar finance --inject-fake-table finance:fake_table
 *
 * Exit code 0 on full coverage (or allowlisted). Non-zero on any miss.
 * Non-zero on usage errors.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * @typedef {object} Pillar
 * @property {string} name    Pillar dir name, e.g. `finance`.
 * @property {string} pkgDir  Repo-relative pillar root, e.g. `pillars/finance`.
 */

/**
 * Discover the pillar set from disk. A pillar is any `pillars/<x>` that
 * exposes a `src/db/schema.ts` barrel — the canonical signal that it owns
 * a migrated schema surface this guard can check. No static list.
 *
 * @returns {Pillar[]}
 */
function discoverPillars() {
  const pillarsRoot = join(repoRoot, 'pillars');
  if (!existsSync(pillarsRoot)) return [];
  /** @type {Pillar[]} */
  const out = [];
  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(join(pillarsRoot, entry.name, 'src', 'db', 'schema.ts'))) continue;
    out.push({ name: entry.name, pkgDir: join('pillars', entry.name) });
  }
  return out.toSorted((a, b) => a.name.localeCompare(b.name));
}

const PILLARS = discoverPillars();

/**
 * Pre-existing drift between the drizzle schema in `@pops/db-types` and
 * the per-pillar migration journals. Each entry is allowlisted so the
 * guard can land on a known-good baseline; close out an entry by adding
 * the missing CREATE INDEX statement to the listed pillar's migrations
 * and removing it from this map.
 *
 * Format: `<pillar>` → set of `"<table>:<index>"` strings (missing
 * indexes only).
 *
 * @type {Record<string, Set<string>>}
 */
const ALLOWLISTED_MISSING_INDEXES = {};

/**
 * Pre-existing missing tables — only as a transitional grandfather while
 * the dependent fix-PR is in flight. Adding to this set is a code smell
 * and should be rare. Each entry MUST be paired with an open PR/issue
 * link in the inline comment.
 *
 * Both entries below are schema scaffolding that the lake-migration
 * relocated into the pillar (drizzle table def + row schemas + barrel
 * re-export) but whose `CREATE TABLE` was never added to the pillar's
 * migrations journal. Neither table is referenced by any service or API
 * handler yet — they are declared surface awaiting wire-up. Close out an
 * entry by adding the `CREATE TABLE` to the listed pillar's migrations and
 * removing it here.
 *
 *   - finance:tier_overrides — relocated by #3344 (REST slice 1); the
 *     finance migrations journal does not create `tier_overrides`.
 *   - registry:environments — relocated by the registry pillar scaffold
 *     (Phase 0; the pillar was formerly named `core`); the registry
 *     migrations journal does not create `environments`.
 *
 * @type {Record<string, Set<string>>}
 */
const ALLOWLISTED_MISSING_TABLES = {
  finance: new Set(['tier_overrides']),
  registry: new Set(['environments']),
};

/**
 * Walk every file under `dir` recursively and return absolute paths
 * matching `.ts` (no `.d.ts`).
 *
 * @param {string} dir
 * @returns {string[]}
 */
function walkTsFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Locate the matching closing paren for `sqliteTable(` starting at
 * `openIdx` (which must point at the `(`). Returns the index of the
 * matching `)`. Throws if unbalanced.
 *
 * Handles single-quoted, double-quoted, template-literal, and `/* … *\/`
 * comments so quoted parens don't confuse the depth counter. Line
 * comments are also stripped.
 *
 * @param {string} src
 * @param {number} openIdx
 * @returns {number}
 */
function findMatchingParen(src, openIdx) {
  if (src[openIdx] !== '(') throw new Error(`expected '(' at ${openIdx}`);
  let depth = 0;
  let i = openIdx;
  /** @type {'' | "'" | '"' | '`' | '//' | '/*'} */
  let mode = '';
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (mode === '//') {
      if (ch === '\n') mode = '';
      i++;
      continue;
    }
    if (mode === '/*') {
      if (ch === '*' && next === '/') {
        mode = '';
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (mode === "'" || mode === '"' || mode === '`') {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === mode) mode = '';
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      mode = '//';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      mode = '/*';
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      mode = ch;
      i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  throw new Error(`unbalanced parens starting at ${openIdx}`);
}

/**
 * Scan a single schema TS file and yield every `export const X =
 * sqliteTable('y', …)` block along with the indexes declared inside
 * that block.
 *
 * @param {string} src
 * @param {string} file
 * @returns {Array<{ symbol: string; tableName: string; indexNames: string[] }>}
 */
function parseTableEntriesInFile(src, file) {
  /** @type {Array<{ symbol: string; tableName: string; indexNames: string[] }>} */
  const out = [];
  const headerRe = /export\s+const\s+(\w+)\s*=\s*sqliteTable\s*\(\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(headerRe)) {
    const symbol = m[1];
    const tableName = m[2];
    const sqliteTableIdx = src.indexOf('sqliteTable', m.index ?? 0);
    if (sqliteTableIdx < 0) continue;
    const openParen = src.indexOf('(', sqliteTableIdx);
    if (openParen < 0) continue;
    let closeParen;
    try {
      closeParen = findMatchingParen(src, openParen);
    } catch (err) {
      throw new Error(`failed to parse table block for ${symbol} in ${file}`, { cause: err });
    }
    const block = src.slice(openParen, closeParen + 1);
    /** @type {string[]} */
    const indexNames = [];
    const indexRe = /(?:uniqueIndex|index)\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const im of block.matchAll(indexRe)) indexNames.push(im[1]);
    out.push({ symbol, tableName, indexNames });
  }
  return out;
}

/**
 * Build a symbol→table map for one pillar by parsing every drizzle table
 * definition the pillar owns under `src/db/schema/**\/*.ts` — including its
 * local copies of tables that other pillars also persist (e.g. `entities`,
 * `aiInferenceLog`).
 *
 * The map is built per pillar (not globally) so same-named symbols owned
 * by different pillars — e.g. `tierOverrides` in both finance and media,
 * each backed by a distinct physical table — never collide.
 *
 * The parser is regex-based (matches `export const FOO = sqliteTable(
 * 'table_name'`, then collects every `index('...')` / `uniqueIndex('...')`
 * literal inside that call). Drizzle's schema files are flat enough that
 * the regex is reliable; anything new the parser doesn't understand fails
 * the script loudly — we don't silently miss tables.
 *
 * @param {Pillar} pillar
 * @returns {Map<string, { tableName: string; indexNames: string[]; sourceFile: string }>}
 */
function buildSymbolToTableMap(pillar) {
  /** @type {Map<string, { tableName: string; indexNames: string[]; sourceFile: string }>} */
  const map = new Map();

  const schemaDir = join(repoRoot, pillar.pkgDir, 'src', 'db', 'schema');

  if (existsSync(schemaDir)) {
    for (const file of walkTsFiles(schemaDir)) {
      if (file.endsWith('-row-schemas.ts')) continue;
      const src = readFileSync(file, 'utf8');
      for (const entry of parseTableEntriesInFile(src, file)) {
        map.set(entry.symbol, {
          tableName: entry.tableName,
          indexNames: entry.indexNames,
          sourceFile: file,
        });
      }
    }
  }

  return map;
}

/**
 * Parse a single TS file's imports and return the list of `from`-clauses
 * paired with their imported specifiers. Handles:
 *   - `import { a, b as c } from '...'`
 *   - `import { type T } from '...'`
 *   - `import * as ns from '...'`
 *   - multi-line `import { ... } from '...'`
 *
 * Skips type-only specifiers (`type T` inside the destructure) because
 * we only care about runtime tables. A pure `import type` line is also
 * skipped (it never produces runtime references).
 *
 * @param {string} src
 * @returns {Array<{ from: string; symbols: string[]; isNamespace: boolean }>}
 */
function parseImports(src) {
  /** @type {Array<{ from: string; symbols: string[]; isNamespace: boolean }>} */
  const out = [];

  const importRe = /import\s+(type\s+)?(\{[\s\S]*?\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(importRe)) {
    const isTypeOnly = Boolean(m[1]);
    const clause = m[2];
    const from = m[3];

    if (isTypeOnly) continue;

    if (clause.startsWith('*')) {
      out.push({ from, symbols: [], isNamespace: true });
      continue;
    }

    if (!clause.startsWith('{')) {
      out.push({ from, symbols: [clause.trim()], isNamespace: false });
      continue;
    }

    const inner = clause.slice(1, -1);
    /** @type {string[]} */
    const symbols = [];
    for (const raw of inner.split(',')) {
      const piece = raw.trim();
      if (!piece) continue;
      if (piece.startsWith('type ')) continue;
      const name = piece.split(/\s+as\s+/u)[0].trim();
      if (name) symbols.push(name);
    }
    out.push({ from, symbols, isNamespace: false });
  }
  return out;
}

/**
 * Inspect a `<pillar>/src/db/schema.ts` barrel and return the set of
 * symbol names it re-exports from its local table modules
 * (`export { x } from './schema/x.js'`). These are the tables the pillar
 * legitimately surfaces — used as the fallback for `import * as schema`
 * style imports.
 *
 * @param {string} schemaFile
 * @returns {Set<string>}
 */
function parsePillarSchemaReExports(schemaFile) {
  const src = readFileSync(schemaFile, 'utf8');
  /** @type {Set<string>} */
  const out = new Set();
  const reExportRe = /export\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/g;
  for (const m of src.matchAll(reExportRe)) {
    for (const raw of m[1].split(',')) {
      const piece = raw.trim();
      if (!piece) continue;
      if (piece.startsWith('type ')) continue;
      const name = piece.split(/\s+as\s+/u)[0].trim();
      if (name) out.add(name);
    }
  }
  return out;
}

/**
 * True if a relative import specifier targets the pillar's schema barrel
 * (`.../schema` or `.../schema.js`) or a specific schema module
 * (`.../schema/<name>` / `.../schema/<name>.js`). Depth-agnostic: matches
 * `../schema.js`, `../../schema.js`, `../schema/foo.js`, etc. — services
 * live at varying nesting depths under `src/db/services/**`.
 *
 * @param {string} from
 * @returns {boolean}
 */
function isPillarSchemaImport(from) {
  if (!from.startsWith('.')) return false;
  const noExt = from.replace(/\.(?:js|ts)$/u, '');
  return noExt.endsWith('/schema') || /\/schema\/[^/]+$/u.test(noExt);
}

/**
 * Compute the set of table-symbol references a pillar makes.
 *
 * Walks every `src/db/services/**\/*.ts` (recursive) plus the pillar's
 * `src/db/schema.ts` re-exports, and returns symbol names that the
 * symbol→table map knows about. Symbols not in the map are dropped — they
 * are not tables (e.g. constants, types, helpers).
 *
 * @param {string} pkgRoot Absolute path to e.g. `pillars/finance`.
 * @param {Map<string, { tableName: string }>} symbolToTable
 * @returns {Set<string>}
 */
function collectUsedTableSymbols(pkgRoot, symbolToTable) {
  const servicesDir = join(pkgRoot, 'src', 'db', 'services');
  const schemaFile = join(pkgRoot, 'src', 'db', 'schema.ts');

  const pillarReExports = existsSync(schemaFile)
    ? parsePillarSchemaReExports(schemaFile)
    : new Set();

  /** @type {Set<string>} */
  const used = new Set();
  for (const sym of pillarReExports) {
    if (symbolToTable.has(sym)) used.add(sym);
  }

  if (!existsSync(servicesDir)) return used;

  for (const file of walkTsFiles(servicesDir)) {
    const src = readFileSync(file, 'utf8');
    for (const imp of parseImports(src)) {
      if (!isPillarSchemaImport(imp.from)) continue;

      if (imp.isNamespace) {
        for (const sym of pillarReExports) {
          if (symbolToTable.has(sym)) used.add(sym);
        }
        continue;
      }
      for (const sym of imp.symbols) {
        if (symbolToTable.has(sym)) used.add(sym);
      }
    }
  }
  return used;
}

/**
 * Run the migrations for a pillar against a fresh temp-file DB by invoking
 * the pillar's exported open function.
 *
 * The opener lives in the built `dist/db/index.js` and is named
 * `open<Pillar>Db`. Rather than hard-code the PascalCase name, it's
 * discovered: the sole export matching `/^open[A-Z]\w*Db$/`. This keeps
 * the script free of any per-pillar name table.
 *
 * Returns the better-sqlite3 raw handle so the caller can query
 * `sqlite_master`. The caller is responsible for `close()` which also
 * unlinks the temp file (including the WAL/SHM sidecars).
 *
 * @param {Pillar} pillar
 * @returns {Promise<{ raw: import('better-sqlite3').Database; close: () => void }>}
 */
async function openPillarInMemory(pillar) {
  const distEntry = join(repoRoot, pillar.pkgDir, 'dist', 'db', 'index.js');
  if (!existsSync(distEntry)) {
    throw new Error(
      `[${pillar.name}] dist/db/index.js not found at ${distEntry}. ` +
        `Run \`pnpm --filter @pops/${pillar.name} build\` first.`
    );
  }
  const mod = await import(distEntry);
  const openerNames = Object.keys(mod).filter((k) => /^open[A-Z]\w*Db$/u.test(k));
  if (openerNames.length !== 1) {
    throw new Error(
      `[${pillar.name}] expected exactly one open<Pillar>Db export in ${distEntry}, ` +
        `found: ${openerNames.length === 0 ? '(none)' : openerNames.join(', ')}`
    );
  }
  /** @type {(path: string) => { raw: import('better-sqlite3').Database }} */
  const opener = mod[openerNames[0]];
  if (typeof opener !== 'function') {
    throw new Error(`[${pillar.name}] expected export ${openerNames[0]} to be a function`);
  }

  const tmpDbPath = join(
    tmpdir(),
    `pillar-schema-coverage-${pillar.name}-${process.pid}-${Date.now()}.db`
  );
  const opened = opener(tmpDbPath);
  return {
    raw: opened.raw,
    close: () => {
      try {
        opened.raw.close();
      } catch {
        // ignore — the file gets unlinked regardless
      }
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          rmSync(`${tmpDbPath}${suffix}`, { force: true });
        } catch {
          // ignore
        }
      }
    },
  };
}

/**
 * Cross-check applied schema against expected table+index set.
 *
 * @param {import('better-sqlite3').Database} raw
 * @param {Set<string>} usedSymbols
 * @param {Map<string, { tableName: string; indexNames: string[] }>} symbolToTable
 * @returns {{ missingTables: string[]; missingIndexes: Array<{ table: string; index: string }> }}
 */
function diff(raw, usedSymbols, symbolToTable) {
  const tableExistsStmt = raw.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
  );
  const indexExistsStmt = raw.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name = ?"
  );

  /** @type {string[]} */
  const missingTables = [];
  /** @type {Array<{ table: string; index: string }>} */
  const missingIndexes = [];

  for (const sym of [...usedSymbols].toSorted()) {
    const entry = symbolToTable.get(sym);
    if (!entry) continue;
    const tableRow = tableExistsStmt.get(entry.tableName);
    if (!tableRow) {
      missingTables.push(entry.tableName);
      continue;
    }
    for (const idx of entry.indexNames) {
      const idxRow = indexExistsStmt.get(idx);
      if (!idxRow) missingIndexes.push({ table: entry.tableName, index: idx });
    }
  }
  return { missingTables, missingIndexes };
}

/**
 * Run the coverage check for one pillar. Returns true on full coverage,
 * false otherwise. Logs a human-readable report either way.
 *
 * The symbol→table map is built per pillar (from its own `src/db/schema/**`,
 * including its local copies of multi-pillar tables) so same-named symbols
 * owned by distinct pillars never collide.
 *
 * @param {Pillar} pillar
 * @param {{ ignoreAllowlist?: boolean; injectFakeTables?: string[] }} [options]
 * @returns {Promise<boolean>}
 */
async function checkPillar(pillar, options = {}) {
  const ignoreAllowlist = options.ignoreAllowlist === true;
  const injectFakeTables = options.injectFakeTables ?? [];
  const pkgRoot = join(repoRoot, pillar.pkgDir);
  if (!existsSync(pkgRoot)) {
    console.error(`[${pillar.name}] pillar not found at ${pkgRoot}`);
    return false;
  }
  const symbolToTable = buildSymbolToTableMap(pillar);
  console.log(`[${pillar.name}] loaded ${symbolToTable.size} table symbol(s).`);
  const used = collectUsedTableSymbols(pkgRoot, symbolToTable);

  for (const fakeTable of injectFakeTables) {
    const fakeSymbol = `__injected_${fakeTable}`;
    symbolToTable.set(fakeSymbol, {
      tableName: fakeTable,
      indexNames: [],
      sourceFile: '<injected>',
    });
    used.add(fakeSymbol);
    console.log(`[${pillar.name}] injected fake expected table: ${fakeTable}`);
  }

  console.log(`[${pillar.name}] inspecting ${used.size} table symbol(s)`);
  if (used.size === 0) {
    console.log(`[${pillar.name}] no tables referenced — nothing to check.`);
    return true;
  }

  const handle = await openPillarInMemory(pillar);
  try {
    const raw = diff(handle.raw, used, symbolToTable);
    const indexAllowlist = ignoreAllowlist
      ? new Set()
      : (ALLOWLISTED_MISSING_INDEXES[pillar.name] ?? new Set());
    const tableAllowlist = ignoreAllowlist
      ? new Set()
      : (ALLOWLISTED_MISSING_TABLES[pillar.name] ?? new Set());
    const allowedIndexes = raw.missingIndexes.filter((m) =>
      indexAllowlist.has(`${m.table}:${m.index}`)
    );
    const allowedTables = raw.missingTables.filter((t) => tableAllowlist.has(t));
    const missingTables = raw.missingTables.filter((t) => !tableAllowlist.has(t));
    const missingIndexes = raw.missingIndexes.filter(
      (m) => !indexAllowlist.has(`${m.table}:${m.index}`)
    );
    if (allowedTables.length > 0) {
      console.warn(
        `[${pillar.name}] WARN — ${allowedTables.length} allowlisted missing table(s) ` +
          `(known latent break; tracked in script header):`
      );
      for (const t of allowedTables) console.warn(`    - ${t}`);
    }
    if (allowedIndexes.length > 0) {
      console.warn(
        `[${pillar.name}] WARN — ${allowedIndexes.length} allowlisted missing index(es) ` +
          `(pre-existing drift; close out by adding to ${pillar.pkgDir}/migrations/):`
      );
      for (const m of allowedIndexes) console.warn(`    - ${m.index} on ${m.table}`);
    }
    if (missingTables.length === 0 && missingIndexes.length === 0) {
      const allowedCount = allowedTables.length + allowedIndexes.length;
      const suffix =
        allowedCount > 0
          ? ` (with ${allowedCount} allowlisted entr${allowedCount === 1 ? 'y' : 'ies'})`
          : '';
      console.log(`[${pillar.name}] OK${suffix}.`);
      const allowedTablesSet = new Set(allowedTables);
      for (const sym of [...used].toSorted()) {
        const entry = symbolToTable.get(sym);
        if (!entry) continue;
        const wasAllowed = allowedTablesSet.has(entry.tableName);
        console.log(`  ${wasAllowed ? '~' : 'OK'} ${entry.tableName}`);
      }
      return true;
    }
    console.error(`[${pillar.name}] FAIL — schema coverage broken.`);
    if (missingTables.length > 0) {
      console.error(`  Missing tables (${missingTables.length}):`);
      for (const t of missingTables) console.error(`    - ${t}`);
    }
    if (missingIndexes.length > 0) {
      console.error(`  Missing indexes (${missingIndexes.length}):`);
      for (const m of missingIndexes) console.error(`    - ${m.index} on ${m.table}`);
    }
    console.error(
      `  Fix: extend ${pillar.pkgDir}/migrations/ with the missing CREATE TABLE / CREATE INDEX statements.`
    );
    return false;
  } finally {
    handle.close();
  }
}

/**
 * @param {string[]} argv
 * @returns {{ pillars: typeof PILLARS[number][]; help: boolean; ignoreAllowlist: boolean; injections: Map<string, string[]> }}
 */
function parseArgs(argv) {
  let pillar = '';
  let all = false;
  let help = false;
  let ignoreAllowlist = false;
  /**
   * Synthetic injections used by the self-test job. The CI workflow asks
   * the script to expect a table that the pillar's migrations do NOT
   * create — proving the guard still catches missing tables without
   * relying on a real prod-state mismatch. Format: `<pillar>:<table>`.
   *
   * @type {Map<string, string[]>}
   */
  const injections = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pillar') pillar = argv[++i] ?? '';
    else if (arg === '--all') all = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--ignore-allowlist') ignoreAllowlist = true;
    else if (arg === '--inject-fake-table') {
      const spec = argv[++i] ?? '';
      const [injPillar, injTable] = spec.split(':');
      if (!injPillar || !injTable) {
        console.error(`--inject-fake-table requires <pillar>:<table>, got: ${spec}`);
        help = true;
        continue;
      }
      const list = injections.get(injPillar) ?? [];
      list.push(injTable);
      injections.set(injPillar, list);
    } else {
      console.error(`unknown arg: ${arg}`);
      help = true;
    }
  }
  if (help) return { pillars: [], help: true, ignoreAllowlist, injections };
  if (all) return { pillars: [...PILLARS], help: false, ignoreAllowlist, injections };
  if (!pillar) return { pillars: [...PILLARS], help: false, ignoreAllowlist, injections };
  const match = PILLARS.find((p) => p.name === pillar);
  if (!match) {
    console.error(`unknown pillar: ${pillar}. Known: ${PILLARS.map((p) => p.name).join(', ')}`);
    return { pillars: [], help: true, ignoreAllowlist, injections };
  }
  return { pillars: [match], help: false, ignoreAllowlist, injections };
}

function usage() {
  console.log(
    [
      'Usage: node scripts/check-pillar-schema-coverage.mjs [--pillar <name>] [--all] [--ignore-allowlist] [--inject-fake-table <pillar>:<table>]',
      '',
      'Pillars: ' + PILLARS.map((p) => p.name).join(', '),
      '',
      'With no args, every pillar is checked.',
      '',
      '--ignore-allowlist disables the in-script grandfather list so the',
      'true diff (including known pre-existing drift) is reported. Use to',
      'verify a follow-up fix actually closes out an allowlisted entry.',
      '',
      '--inject-fake-table <pillar>:<table> tells the script to expect',
      'a table that does NOT exist in the pillar migrations. Used by the',
      'CI self-test to prove the guard still flags missing tables without',
      'depending on a real prod-state mismatch. Repeatable.',
    ].join('\n')
  );
}

async function main() {
  const { pillars, help, ignoreAllowlist, injections } = parseArgs(process.argv.slice(2));
  if (help) {
    usage();
    process.exit(2);
  }
  if (pillars.length === 0) {
    console.error(
      'No pillars discovered under pillars/* with a src/db/schema.ts barrel. ' + 'Nothing to check.'
    );
    process.exit(1);
  }
  if (ignoreAllowlist) console.log('--ignore-allowlist set: every miss is treated as a failure.');

  let allOk = true;
  for (const pillar of pillars) {
    const ok = await checkPillar(pillar, {
      ignoreAllowlist,
      injectFakeTables: injections.get(pillar.name) ?? [],
    });
    if (!ok) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Shared, statement-anchored module-specifier extraction for the federation
 * isolation guards. Used by `check-lib-no-pillar-import.mjs` and
 * `check-contract-isolation.mjs`.
 *
 * The patterns are anchored to the start of a real import/export/require
 * **statement** (preceding char is start-of-line or whitespace/semicolon), so
 * a specifier that merely appears inside a string literal — e.g. a test
 * fixture `"import { x } from '@pops/finance/src/y'"` or a guard's own
 * self-test — is NOT matched. A naive `line.includes('import')` check would
 * false-positive on those; this does not.
 */

/**
 * Each entry matches one import form and captures the module specifier in
 * group 1. The static `import`/`export … from` forms require the keyword to
 * begin a statement (`(?:^|[\s;])`) so keywords embedded in a string literal
 * are skipped.
 */
const IMPORT_PATTERNS = [
  /(?:^|[\s;])import\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/gm,
  /(?:^|[\s;])export\s+(?:type\s+)?(?:[^'";]+?\s+)?from\s+['"]([^'"]+)['"]/gm,
  /(?:^|[\s;])(?:await\s+)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm,
  /(?:^|[\s.])require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm,
];

/**
 * Replace the contents of `//` and block comments with spaces, preserving
 * every character offset and newline so downstream line/column math stays
 * accurate. String and template literals are kept intact (their `//` is not a
 * comment). This is why a commented-out `// import x from '@pops/foo/src/y'`
 * is not mistaken for a real import.
 *
 * @param {string} src
 * @returns {string}
 */
export function stripComments(src) {
  let out = '';
  /** @type {'' | "'" | '"' | '`' | '//' | '/*'} */
  let mode = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = i + 1 < src.length ? src[i + 1] : '';
    if (mode === '//') {
      if (ch === '\n') {
        mode = '';
        out += ch;
      } else out += ' ';
      continue;
    }
    if (mode === '/*') {
      if (ch === '*' && next === '/') {
        mode = '';
        out += '  ';
        i++;
      } else out += ch === '\n' ? '\n' : ' ';
      continue;
    }
    if (mode === "'" || mode === '"' || mode === '`') {
      out += ch;
      if (ch === '\\') {
        out += next;
        i++;
        continue;
      }
      if (ch === mode) mode = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      mode = '//';
      out += '  ';
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      mode = '/*';
      out += '  ';
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') mode = ch;
    out += ch;
  }
  return out;
}

/**
 * Module specifiers referenced by real import/export/require statements.
 *
 * @param {string} src
 * @returns {string[]}
 */
export function extractSpecifiers(src) {
  const code = stripComments(src);
  /** @type {string[]} */
  const out = [];
  for (const re of IMPORT_PATTERNS) {
    for (const m of code.matchAll(re)) out.push(m[1]);
  }
  return out;
}

/**
 * Module specifiers plus the 1-based line each appears on. The line is
 * computed from the specifier's own offset (not the match start) so a leading
 * newline captured by `(?:^|[\s;])` never skews it.
 *
 * @param {string} src
 * @returns {Array<{ specifier: string; line: number }>}
 */
export function extractSpecifiersWithLines(src) {
  const code = stripComments(src);
  /** @type {Array<{ specifier: string; line: number }>} */
  const out = [];
  for (const re of IMPORT_PATTERNS) {
    for (const m of code.matchAll(re)) {
      const specifier = m[1];
      const at = (m.index ?? 0) + m[0].lastIndexOf(specifier);
      let line = 1;
      for (let i = 0; i < at && i < code.length; i++) {
        if (code[i] === '\n') line++;
      }
      out.push({ specifier, line });
    }
  }
  return out;
}

/**
 * True if `relPath` is a test file or lives under a `__tests__` dir — a unit's
 * test surface, excluded from the runtime/contract isolation scans.
 *
 * @param {string} relPath
 * @returns {boolean}
 */
export function isTestPath(relPath) {
  return /(?:^|\/)__tests__\//u.test(relPath) || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(relPath);
}

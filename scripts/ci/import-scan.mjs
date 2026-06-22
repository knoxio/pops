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
 * Single code characters after which a `/` begins a regex literal (not
 * division). Covers the contexts where regexes actually appear in this
 * codebase (array elements, assignments, calls, returns).
 */
const REGEX_PREV_CHARS = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '<',
  '>',
  '~',
  '^',
]);

/** Keywords after which a `/` begins a regex literal. */
const REGEX_PREV_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'do',
  'else',
  'yield',
  'await',
  'case',
]);

/**
 * @param {string} s
 * @returns {string}  `s` with every non-newline replaced by a space.
 */
function blank(s) {
  return s.replace(/[^\n]/gu, ' ');
}

/**
 * Replace `//` and block-comment contents with spaces, preserving every
 * character offset and newline so downstream line math stays accurate.
 *
 * A correct strip requires a mini-lexer, not a regex: string/template literals
 * are kept verbatim (the module specifier lives inside their quotes), while
 * **regex literals are recognized and blanked** — otherwise the `'`/`"` inside
 * a pattern like `/import\s+['"]([^'"]+)['"]/` would be mistaken for string
 * delimiters, desync the scanner, and leave a following comment unstripped
 * (e.g. a commented-out `// import x from '@pops/foo/src/y'` would then read as
 * a real import). Regex-vs-division is disambiguated by the preceding token.
 *
 * @param {string} src
 * @returns {string}
 */
export function stripComments(src) {
  const n = src.length;
  let out = '';
  let i = 0;
  /** last significant (non-whitespace) code char emitted */
  let prevChar = '';
  /** trailing identifier word, for keyword-before-regex detection */
  let prevWord = '';

  while (i < n) {
    const ch = src[i];
    const next = i + 1 < n ? src[i + 1] : '';

    if (ch === '/' && next === '/') {
      let j = i + 2;
      while (j < n && src[j] !== '\n') j++;
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '/' && next === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j = Math.min(j + 2, n);
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === ch) {
          j++;
          break;
        }
        j++;
      }
      out += src.slice(i, j);
      prevChar = ch;
      prevWord = '';
      i = j;
      continue;
    }
    if (ch === '/' && (REGEX_PREV_CHARS.has(prevChar) || REGEX_PREV_KEYWORDS.has(prevWord))) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const c = src[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '\n') break;
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) {
          j++;
          break;
        }
        j++;
      }
      out += blank(src.slice(i, j));
      prevChar = '/';
      prevWord = '';
      i = j;
      continue;
    }
    out += ch;
    if (!/\s/u.test(ch)) {
      prevChar = ch;
      prevWord = /[A-Za-z0-9_$]/u.test(ch) ? prevWord + ch : '';
    }
    i++;
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

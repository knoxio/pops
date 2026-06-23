#!/usr/bin/env node
/**
 * cargo-extract — materialize a single workspace member crate as a standalone,
 * workspace-free package in an output dir, ready to `cargo build` in isolation.
 * The cargo analogue of the TS `rewrite-deps.mjs` step (docs/plans/repo-
 * federation/04-isolation-enforcement.md §8, RUST-3).
 *
 * The single mutation it performs — the "changing only where shared deps come
 * from" clause — is to break every workspace inheritance edge:
 *
 *   1. `[workspace.package]` inheritance (`edition.workspace = true`,
 *      `license.workspace = true`, `publish.workspace = true`, …) is inlined
 *      from the workspace root's `[workspace.package]`.
 *   2. `[workspace.dependencies]` inheritance (`dep = { workspace = true }`) is
 *      replaced with the dep's concrete spec from the root
 *      `[workspace.dependencies]`, merging any member-local `features`/
 *      `optional`/`default-features` overrides on top.
 *   3. The member's `workspace = "../.."` package pointer (if present) is
 *      dropped, and an empty `[workspace]` table is appended so the extracted
 *      crate is its own root and does not climb back to the parent workspace.
 *
 * Everything else is copied verbatim. If the crate builds after this — with no
 * workspace path resolution available — it is extraction-ready.
 *
 * Usage:
 *   node scripts/extractability/cargo-extract.mjs <member-dir> <out-dir>
 *   node scripts/extractability/cargo-extract.mjs libs/pops-ai /tmp/crate-out
 *
 * Exit 0 on success; exit 2 on usage / parse error.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * Strip a `#` comment outside any string. (Member manifests do not embed `#`
 * inside the values this tool reads.)
 *
 * @param {string} line
 * @returns {string}
 */
function stripComment(line) {
  let inStr = false;
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inStr) {
      if (ch === quote) inStr = false;
    } else if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
    } else if (ch === '#') return line.slice(0, i);
  }
  return line;
}

/**
 * Parse an inline-table body (the text between `{` and `}`) into a flat record
 * of `key -> rawValue` (value kept as raw TOML text: a quoted string, an array,
 * or a bareword like `true`). Sufficient for cargo dependency specs, which are
 * single-level inline tables.
 *
 * @param {string} body
 * @returns {Record<string, string>}
 */
function parseInlineTable(body) {
  /** @type {Record<string, string>} */
  const out = {};
  let i = 0;
  const n = body.length;
  const skipWs = () => {
    while (i < n && /\s/u.test(body[i])) i += 1;
  };
  while (i < n) {
    skipWs();
    if (i >= n) break;
    const keyStart = i;
    while (i < n && /[A-Za-z0-9_-]/u.test(body[i])) i += 1;
    const key = body.slice(keyStart, i);
    skipWs();
    if (body[i] !== '=') break;
    i += 1;
    skipWs();
    let valStart = i;
    let val = '';
    if (body[i] === '"' || body[i] === "'") {
      const q = body[i];
      i += 1;
      while (i < n && body[i] !== q) i += 1;
      i += 1;
      val = body.slice(valStart, i);
    } else if (body[i] === '[') {
      let depth = 0;
      do {
        if (body[i] === '[') depth += 1;
        else if (body[i] === ']') depth -= 1;
        i += 1;
      } while (i < n && depth > 0);
      val = body.slice(valStart, i);
    } else {
      while (i < n && body[i] !== ',') i += 1;
      val = body.slice(valStart, i).trim();
    }
    out[key] = val;
    skipWs();
    if (body[i] === ',') i += 1;
  }
  return out;
}

/**
 * Read a section's raw key/value lines from a Cargo.toml, returning an ordered
 * map of `key -> rawValueText` for the FIRST occurrence of `[<section>]`.
 *
 * @param {string} toml
 * @param {string} section
 * @returns {Map<string, string>}
 */
function readSection(toml, section) {
  /** @type {Map<string, string>} */
  const out = new Map();
  let inSection = false;
  for (const raw of toml.split('\n')) {
    const line = stripComment(raw).trimEnd();
    const header = line.trim().match(/^\[([^\]]+)\]$/u);
    if (header) {
      if (inSection) break;
      inSection = header[1] === section;
      continue;
    }
    if (!inSection) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (key) out.set(key, line.slice(eq + 1).trim());
  }
  return out;
}

/**
 * Serialize a concrete dependency spec to a single TOML line, merging the
 * workspace base spec with member-local overrides (the member's `features` are
 * unioned with the workspace base features; other override keys win).
 *
 * @param {string} name
 * @param {string} workspaceSpecRaw  Raw RHS of the workspace dep (string or `{…}`).
 * @param {Record<string,string>} memberOverrides  Inline-table keys from the member, minus `workspace`.
 * @returns {string}
 */
function mergeDepLine(name, workspaceSpecRaw, memberOverrides) {
  /** @type {Record<string,string>} */
  let base;
  const trimmed = workspaceSpecRaw.trim();
  if (trimmed.startsWith('{')) {
    base = parseInlineTable(trimmed.slice(trimmed.indexOf('{') + 1, trimmed.lastIndexOf('}')));
  } else {
    base = { version: trimmed };
  }
  const merged = { ...base };
  for (const [k, v] of Object.entries(memberOverrides)) {
    if (k === 'features' && base.features) {
      const union = new Set();
      for (const src of [base.features, v]) {
        for (const m of src.matchAll(/["']([^"']+)["']/gu)) union.add(m[1]);
      }
      merged.features = `[${[...union].map((f) => `"${f}"`).join(', ')}]`;
    } else {
      merged[k] = v;
    }
  }
  const parts = Object.entries(merged).map(([k, v]) => `${k} = ${v}`);
  return `${name} = { ${parts.join(', ')} }`;
}

/**
 * Rewrite a member Cargo.toml to a standalone manifest: inline
 * `[workspace.package]` inheritance, resolve `{ workspace = true }` deps from
 * the root `[workspace.dependencies]`, drop the `workspace = "…"` pointer, and
 * append an empty `[workspace]` so the crate roots itself.
 *
 * @param {string} memberToml  Member manifest text.
 * @param {string} rootToml    Workspace-root manifest text.
 * @returns {string}
 */
export function rewriteManifest(memberToml, rootToml) {
  const wsPackage = readSection(rootToml, 'workspace.package');
  const wsDeps = readSection(rootToml, 'workspace.dependencies');

  const lines = memberToml.split('\n');
  /** @type {string[]} */
  const out = [];
  let section = '';
  const depTables = new Set(['dependencies', 'dev-dependencies', 'build-dependencies']);
  const isDepTable = (s) => depTables.has(s) || [...depTables].some((t) => s.endsWith(`.${t}`));

  for (const raw of lines) {
    const codeOnly = stripComment(raw);
    const header = codeOnly.trim().match(/^\[([^\]]+)\]$/u);
    if (header) {
      section = header[1];
      out.push(raw);
      continue;
    }

    if (section === 'package') {
      const inherit = codeOnly.trim().match(/^([A-Za-z0-9_-]+)\.workspace\s*=\s*true\b/u);
      if (inherit) {
        const field = inherit[1];
        const val = wsPackage.get(field);
        out.push(val !== undefined ? `${field} = ${val}` : raw);
        continue;
      }
      if (/^workspace\s*=/u.test(codeOnly.trim())) continue; // drop the package→workspace pointer
      out.push(raw);
      continue;
    }

    if (isDepTable(section)) {
      const m = codeOnly.trim().match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/u);
      if (m && /\bworkspace\s*=\s*true\b/u.test(m[2])) {
        const name = m[1];
        const wsSpec = wsDeps.get(name);
        if (wsSpec === undefined) {
          throw new Error(
            `'${name}' is { workspace = true } but absent from [workspace.dependencies]`
          );
        }
        const inlineBody = m[2].trim().startsWith('{')
          ? m[2].trim().slice(m[2].indexOf('{') + 1, m[2].lastIndexOf('}'))
          : '';
        const overrides = parseInlineTable(inlineBody);
        delete overrides.workspace;
        out.push(mergeDepLine(name, wsSpec, overrides));
        continue;
      }
      out.push(raw);
      continue;
    }

    out.push(raw);
  }

  out.push(
    '',
    '# Inserted by cargo-extract.mjs: root the crate so it does not',
    '# climb to the parent workspace during isolated build.',
    '[workspace]'
  );
  return `${out.join('\n').replace(/\n+$/u, '')}\n`;
}

function main() {
  const [member, outDir] = process.argv.slice(2);
  if (!member || !outDir || member === '--help' || member === '-h') {
    console.error('Usage: node scripts/extractability/cargo-extract.mjs <member-dir> <out-dir>');
    process.exit(2);
  }
  const memberAbs = resolve(repoRoot, member);
  const memberToml = join(memberAbs, 'Cargo.toml');
  const rootToml = join(repoRoot, 'Cargo.toml');
  if (!existsSync(memberToml)) {
    console.error(`no Cargo.toml at ${memberToml}`);
    process.exit(2);
  }

  const out = resolve(outDir);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(memberAbs, out, {
    recursive: true,
    filter: (src) => !/(^|\/)(target|node_modules)(\/|$)/u.test(src),
  });

  let rewritten;
  try {
    rewritten = rewriteManifest(readFileSync(memberToml, 'utf8'), readFileSync(rootToml, 'utf8'));
  } catch (err) {
    console.error(`cargo-extract: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }
  writeFileSync(join(out, 'Cargo.toml'), rewritten);
  console.log(`cargo-extract: ${member} -> ${out} (workspace edges inlined)`);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}

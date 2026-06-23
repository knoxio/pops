#!/usr/bin/env node
/**
 * Federation isolation guard for the cargo workspace — the Rust mirror of
 * `scripts/ci/check-lib-no-pillar-import.mjs` (docs/plans/repo-federation/
 * 04-isolation-enforcement.md §8, RUST-2).
 *
 * Rust is structurally stronger than TS — a crate only sees another crate's
 * `pub` surface, there is no path-import escape hatch — but cargo will happily
 * let a lib crate take a `[dependencies]` edge on a pillar crate, inverting the
 * dependency and blocking extraction. cargo itself won't stop it; this guard
 * does.
 *
 * Two-kind taxonomy (same as the TS side, classified by directory):
 *   - PILLAR : a workspace member under `pillars/`  (e.g. `pillars/contacts`).
 *   - LIB    : a workspace member under `libs/`      (e.g. `libs/pops-ai`,
 *              `libs/pops-settings`).
 *
 * Rules enforced (§8 crate-boundary table):
 *   RUST-2a  a LIB crate must not `[dependencies]` (or dev/build-depend on) a
 *            PILLAR crate.                                            (HARD)
 *   RUST-2b  a PILLAR crate must not depend on ANOTHER pillar crate; cross-
 *            pillar consumption is REST or a shared lib, never a crate edge.
 *                                                                     (HARD)
 *
 * Disk-discovered (principle P-8): the member list and the pillar/lib split are
 * read from the live workspace `Cargo.toml` + each member's `Cargo.toml`, so a
 * new crate is gated the moment it joins `[workspace].members` with no edit
 * here.
 *
 * A path/git dependency edge (`{ path = "..." }`) onto a sibling member, or a
 * registry dependency whose name equals a workspace member crate name, both
 * count as a crate edge for this guard — either form pulls the other crate into
 * the build graph.
 *
 * Usage:
 *   node scripts/extractability/check-cargo-deps.mjs
 *   node scripts/extractability/check-cargo-deps.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = at least one violation. Exit 2 = usage / parse error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Dependency tables whose entries pull a crate into the build graph. */
const DEP_TABLES = ['dependencies', 'dev-dependencies', 'build-dependencies'];

/**
 * @typedef {object} Crate
 * @property {string} dir   Repo-relative dir, e.g. `pillars/contacts`.
 * @property {string} name  Crate name from `[package].name`, e.g. `contacts`.
 * @property {'pillar'|'lib'} kind
 * @property {string[]} deps  Dependency crate names across all dep tables.
 */

/**
 * Strip TOML comments (a `#` outside a string) and trim. Cargo manifests do not
 * embed `#` inside the keys/values this guard reads (crate names, paths,
 * versions), so a quote-aware single-pass strip is sufficient and avoids a
 * full-TOML dependency.
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
    } else if (ch === '#') {
      return line.slice(0, i).trim();
    }
  }
  return line.trim();
}

/**
 * Extract the `members` array from a workspace `Cargo.toml`. Handles the array
 * written across one or many lines. Members are repo-relative paths.
 *
 * @param {string} toml
 * @returns {string[]}
 */
export function parseWorkspaceMembers(toml) {
  const lines = toml.split('\n').map(stripComment);
  let inWorkspace = false;
  /** @type {string[]} */
  const collected = [];
  let buffer = '';
  let collecting = false;
  for (const line of lines) {
    if (/^\[[^\]]+\]$/u.test(line)) {
      inWorkspace = line === '[workspace]';
      if (!inWorkspace) collecting = false;
      continue;
    }
    if (!inWorkspace) continue;
    if (!collecting && /^members\s*=/u.test(line)) {
      collecting = true;
      buffer = line.slice(line.indexOf('=') + 1);
    } else if (collecting) {
      buffer += `\n${line}`;
    }
    if (collecting && buffer.includes(']')) {
      const inner = buffer.slice(buffer.indexOf('[') + 1, buffer.lastIndexOf(']'));
      for (const m of inner.matchAll(/["']([^"']+)["']/gu)) collected.push(m[1]);
      collecting = false;
      buffer = '';
    }
  }
  return collected;
}

/**
 * Parse a member `Cargo.toml` into its package name + the set of dependency
 * crate names declared across `[dependencies]`, `[dev-dependencies]` and
 * `[build-dependencies]` (incl. `[target.<cfg>.dependencies]`).
 *
 * Both inline forms count: `foo = "1"` and `foo = { workspace = true }`, and
 * the renamed form `bar = { package = "foo" }` resolves to the real crate
 * `foo`. Returns dependency names (post-rename) — sibling-member detection is
 * by crate name, which is what the build graph keys on.
 *
 * @param {string} toml
 * @returns {{ name: string; deps: string[] }}
 */
export function parseMemberManifest(toml) {
  const lines = toml.split('\n');
  let section = '';
  let name = '';
  /** @type {Set<string>} */
  const deps = new Set();
  for (const raw of lines) {
    const line = stripComment(raw);
    if (line === '') continue;
    const header = line.match(/^\[([^\]]+)\]$/u);
    if (header) {
      section = header[1];
      continue;
    }
    if (section === 'package') {
      const m = line.match(/^name\s*=\s*["']([^"']+)["']/u);
      if (m) name = m[1];
      continue;
    }
    const isDepTable =
      DEP_TABLES.includes(section) ||
      DEP_TABLES.some((t) => section === t || section.endsWith(`.${t}`));
    if (!isDepTable) continue;
    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*=/u);
    if (!keyMatch) continue;
    const key = keyMatch[1];
    const renamed = line.match(/package\s*=\s*["']([^"']+)["']/u);
    deps.add(renamed ? renamed[1] : key);
  }
  return { name, deps: [...deps] };
}

/**
 * Discover every workspace member crate, classified by directory.
 *
 * @param {string} [root]  Repo root (override for tests).
 * @returns {Crate[]}
 */
export function discoverCrates(root = repoRoot) {
  const wsPath = join(root, 'Cargo.toml');
  if (!existsSync(wsPath)) {
    throw new Error(`no workspace Cargo.toml at ${wsPath}`);
  }
  const members = parseWorkspaceMembers(readFileSync(wsPath, 'utf8'));
  /** @type {Crate[]} */
  const crates = [];
  for (const member of members) {
    const memberToml = join(root, member, 'Cargo.toml');
    if (!existsSync(memberToml)) {
      throw new Error(`workspace member '${member}' has no Cargo.toml`);
    }
    const { name, deps } = parseMemberManifest(readFileSync(memberToml, 'utf8'));
    if (!name) throw new Error(`member '${member}' has no [package].name`);
    /** @type {'pillar'|'lib'|null} */
    let kind = null;
    if (member.startsWith('pillars/')) kind = 'pillar';
    else if (member.startsWith('libs/')) kind = 'lib';
    if (!kind) continue; // crate outside the pillar/lib taxonomy — not gated.
    crates.push({ dir: member, name, kind, deps });
  }
  return crates.toSorted((a, b) => a.dir.localeCompare(b.dir));
}

/**
 * @typedef {object} Violation
 * @property {string} from    Offending crate name.
 * @property {'lib'|'pillar'} fromKind
 * @property {string} to      Pillar crate name reached.
 * @property {'RUST-2a'|'RUST-2b'} rule
 */

/**
 * Pure detector — find every forbidden crate edge. Exported for tests.
 *
 *   RUST-2a : a lib depends on any pillar crate.
 *   RUST-2b : a pillar depends on a DIFFERENT pillar crate (self-edge ignored).
 *
 * @param {Crate[]} crates
 * @returns {Violation[]}
 */
export function findViolations(crates) {
  const pillarNames = new Set(crates.filter((c) => c.kind === 'pillar').map((c) => c.name));
  /** @type {Violation[]} */
  const violations = [];
  for (const crate of crates) {
    for (const dep of crate.deps) {
      if (!pillarNames.has(dep)) continue;
      if (crate.kind === 'lib') {
        violations.push({ from: crate.name, fromKind: 'lib', to: dep, rule: 'RUST-2a' });
      } else if (crate.kind === 'pillar' && dep !== crate.name) {
        violations.push({ from: crate.name, fromKind: 'pillar', to: dep, rule: 'RUST-2b' });
      }
    }
  }
  return violations;
}

/**
 * Self-test: prove the detector flags a lib→pillar edge and a pillar→pillar
 * edge, and passes a clean fixture. Mirrors the `--self-test` in
 * check-lib-no-pillar-import.mjs so a regression that neuters the guard is
 * caught without depending on a real-tree violation.
 *
 * @returns {boolean}
 */
function selfTest() {
  /** @type {Crate[]} */
  const fixture = [
    { dir: 'pillars/contacts', name: 'contacts', kind: 'pillar', deps: ['axum', 'sqlx'] },
    { dir: 'pillars/finance', name: 'finance', kind: 'pillar', deps: ['contacts'] },
    { dir: 'libs/pops-ai', name: 'pops-ai', kind: 'lib', deps: ['contacts', 'serde'] },
    { dir: 'libs/pops-settings', name: 'pops-settings', kind: 'lib', deps: ['serde', 'axum'] },
  ];
  const found = findViolations(fixture);
  const caughtLib = found.some(
    (v) => v.from === 'pops-ai' && v.to === 'contacts' && v.rule === 'RUST-2a'
  );
  const caughtPillar = found.some(
    (v) => v.from === 'finance' && v.to === 'contacts' && v.rule === 'RUST-2b'
  );
  const cleanPassed = !found.some((v) => v.from === 'pops-settings');
  const ok = caughtLib && caughtPillar && cleanPassed;
  if (!ok) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    console.error(`  caught lib→pillar (RUST-2a):    ${caughtLib}`);
    console.error(`  caught pillar→pillar (RUST-2b): ${caughtPillar}`);
    console.error(`  clean lib passed:               ${cleanPassed}`);
  } else {
    console.log('self-test OK — guard flags lib→pillar + pillar→pillar, passes clean lib.');
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/extractability/check-cargo-deps.mjs [--self-test]\n' +
        'Fails if a lib crate depends on a pillar crate, or a pillar crate ' +
        'depends on another pillar crate.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  let crates;
  try {
    crates = discoverCrates();
  } catch (err) {
    console.error(
      `FAIL — could not read the cargo workspace: ${err instanceof Error ? err.message : err}`
    );
    process.exit(2);
  }
  const libs = crates.filter((c) => c.kind === 'lib');
  const pillars = crates.filter((c) => c.kind === 'pillar');
  console.log(
    `Scanned ${crates.length} workspace crate(s): ${pillars.length} pillar(s), ${libs.length} lib(s).`
  );

  const violations = findViolations(crates);
  if (violations.length === 0) {
    console.log('OK — no lib→pillar and no pillar→pillar crate dependency.');
    process.exit(0);
  }
  console.error(`FAIL — ${violations.length} crate-boundary violation(s):`);
  for (const v of violations.toSorted((a, b) => a.from.localeCompare(b.from))) {
    const why =
      v.rule === 'RUST-2a'
        ? 'a lib must never depend on a pillar (inverts the dependency, blocks extraction)'
        : 'a pillar must consume another pillar via REST or a shared lib, never a crate edge';
    console.error(`  [${v.rule}] ${v.from} (${v.fromKind}) → ${v.to} (pillar) — ${why}`);
  }
  process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}

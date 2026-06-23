#!/usr/bin/env node
/**
 * Vendored-contract drift guard.
 *
 * Some app units consume a sibling pillar's OpenAPI contract at codegen time
 * but cannot depend on it through a `@pops/*` package — the producing pillar
 * has no npm package (e.g. `contacts`, a Rust pillar invisible to pnpm by
 * design, see docs/plans/repo-federation/02-build-system.md). Per ADR-033 the
 * OpenAPI snapshot IS that pillar's cross-language contract, so the consumer
 * vendors a copy of the published snapshot inside its OWN unit boundary
 * (`pillars/<consumer>/app/contracts/<pillar>.openapi.json`) and generates its
 * client from the local copy. That keeps the unit black-box-isolated and
 * extraction-ready: it never reaches into the sibling pillar's folder, and on
 * extraction it carries its own contract input.
 *
 * The one risk a vendored copy introduces is drift: the snapshot the consumer
 * ships could lag the producer's canonical spec. This guard closes that gap —
 * every vendored copy must be byte-identical to the canonical
 * `pillars/<pillar>/openapi/<pillar>.openapi.json`. If the producer's contract
 * changes, this fails until the consumer re-vendors (and regenerates its
 * client), so the seam stays honest.
 *
 * It is a whole-tree check (reads the working tree directly, pulls in no
 * third-party deps) and is mapping-driven: a vendored file
 * `.../contracts/<name>.openapi.json` is paired with the canonical producer
 * spec `pillars/<name>/openapi/<name>.openapi.json` by filename. A vendored
 * file with no matching producer spec is itself a failure (stale or
 * mis-named) so the convention can't rot silently.
 *
 * Usage:
 *   node scripts/ci/check-vendored-contracts.mjs
 *   node scripts/ci/check-vendored-contracts.mjs --self-test
 *
 * Exit 0 = every vendored copy matches its source. Exit 1 = drift / orphan.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const VENDORED_SUFFIX = '.openapi.json';

/**
 * @typedef {object} VendoredContract
 * @property {string} copy        Absolute path to the vendored snapshot.
 * @property {string} source      Absolute path to the canonical producer spec.
 * @property {string} pillarId    Producer pillar id (derived from the filename).
 */

/**
 * Discover every vendored contract under `pillars/<consumer>/app/contracts/`
 * and pair each with the canonical producer spec it must mirror.
 *
 * @param {string} root Repo root to scan.
 * @returns {VendoredContract[]}
 */
export function discoverVendoredContracts(root) {
  /** @type {VendoredContract[]} */
  const found = [];
  const pillarsDir = join(root, 'pillars');
  if (!existsSync(pillarsDir)) return found;

  for (const consumer of readdirSync(pillarsDir, { withFileTypes: true })) {
    if (!consumer.isDirectory()) continue;
    const contractsDir = join(pillarsDir, consumer.name, 'app', 'contracts');
    if (!existsSync(contractsDir)) continue;
    for (const entry of readdirSync(contractsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(VENDORED_SUFFIX)) continue;
      const pillarId = entry.name.slice(0, -VENDORED_SUFFIX.length);
      found.push({
        copy: join(contractsDir, entry.name),
        source: join(pillarsDir, pillarId, 'openapi', entry.name),
        pillarId,
      });
    }
  }
  return found.toSorted((a, b) => a.copy.localeCompare(b.copy));
}

/**
 * @typedef {object} DriftFinding
 * @property {'orphan' | 'drift'} kind
 * @property {string} copy
 * @property {string} source
 */

/**
 * Compare each vendored copy against its canonical source.
 *
 * @param {VendoredContract[]} contracts
 * @param {(p: string) => string | null} read Reads a file, or null if absent.
 * @returns {DriftFinding[]}
 */
export function findDrift(contracts, read) {
  /** @type {DriftFinding[]} */
  const findings = [];
  for (const { copy, source } of contracts) {
    const sourceText = read(source);
    if (sourceText === null) {
      findings.push({ kind: 'orphan', copy, source });
      continue;
    }
    const copyText = read(copy);
    if (copyText !== sourceText) {
      findings.push({ kind: 'drift', copy, source });
    }
  }
  return findings;
}

/** @param {string} path @returns {string | null} */
function readOrNull(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** @param {string} to */
function rel(to) {
  return to.startsWith(`${repoRoot}/`) ? to.slice(repoRoot.length + 1) : to;
}

/**
 * Self-test: prove the detector flags drift and an orphan, and passes an
 * identical pair. CI runs this so a regression that neuters the matcher is
 * caught deterministically.
 *
 * @returns {boolean}
 */
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'vendored-contracts-'));
  try {
    const files = new Map([
      [join(dir, 'src-match.json'), '{"a":1}\n'],
      [join(dir, 'copy-match.json'), '{"a":1}\n'],
      [join(dir, 'src-drift.json'), '{"a":1}\n'],
      [join(dir, 'copy-drift.json'), '{"a":2}\n'],
      [join(dir, 'copy-orphan.json'), '{"a":1}\n'],
    ]);
    for (const [path, text] of files) writeFileSync(path, text);

    const read = (/** @type {string} */ p) => (files.has(p) ? (files.get(p) ?? null) : null);
    const contracts = [
      { copy: join(dir, 'copy-match.json'), source: join(dir, 'src-match.json'), pillarId: 'm' },
      { copy: join(dir, 'copy-drift.json'), source: join(dir, 'src-drift.json'), pillarId: 'd' },
      {
        copy: join(dir, 'copy-orphan.json'),
        source: join(dir, 'src-missing.json'),
        pillarId: 'o',
      },
    ];
    const findings = findDrift(contracts, read);
    const drift = findings.find((f) => f.kind === 'drift' && f.copy.endsWith('copy-drift.json'));
    const orphan = findings.find((f) => f.kind === 'orphan' && f.copy.endsWith('copy-orphan.json'));
    const matchedAllowed = !findings.some((f) => f.copy.endsWith('copy-match.json'));

    const ok = Boolean(drift) && Boolean(orphan) && matchedAllowed && findings.length === 2;
    if (!ok) {
      console.error('SELF-TEST FAILED:');
      console.error(`  caught drift:          ${Boolean(drift)}`);
      console.error(`  caught orphan:         ${Boolean(orphan)}`);
      console.error(`  allowed identical:     ${matchedAllowed}`);
      console.error(`  exactly 2 findings:    ${findings.length === 2}`);
    } else {
      console.log('self-test OK — flags drift + orphan, allows an identical copy.');
    }
    return ok;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/ci/check-vendored-contracts.mjs [--self-test]');
    process.exit(2);
  }
  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const contracts = discoverVendoredContracts(repoRoot);
  if (contracts.length === 0) {
    console.log('OK — no vendored pillar contracts found.');
    process.exit(0);
  }

  const findings = findDrift(contracts, readOrNull);
  if (findings.length === 0) {
    console.log(`OK — ${contracts.length} vendored contract(s) match their canonical source.`);
    process.exit(0);
  }

  console.error(`FAIL — ${findings.length} vendored contract problem(s):`);
  for (const f of findings) {
    if (f.kind === 'orphan') {
      console.error(
        `  ${rel(f.copy)}\n      no canonical source at ${rel(f.source)} (stale or mis-named vendored copy)`
      );
    } else {
      console.error(
        `  ${rel(f.copy)}\n      drifted from ${rel(f.source)} — re-vendor and regenerate the client`
      );
    }
  }
  console.error(
    '\nA vendored contract must stay byte-identical to its producing pillar’s ' +
      'canonical OpenAPI snapshot. Copy the source over the vendored file and ' +
      'rerun the consumer’s generate:*-client script.'
  );
  process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}

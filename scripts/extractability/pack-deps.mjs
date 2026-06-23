#!/usr/bin/env node
/**
 * EX-2 helper — pack a unit's @pops/* workspace dependencies into tarballs.
 *
 * For the sandbox extraction we replace every `workspace:*` edge with a packed
 * tarball (`pnpm pack`), so the unit installs against published-shaped
 * artifacts instead of the live workspace tree. If a unit secretly reaches
 * behind a contract, the reached file is NOT in the packed dist (the `files`
 * whitelist excluded it) and the isolated build fails — exactly the litmus.
 *
 * Each dep is built (so its dist/ exists) then packed into <outDir>. Emits a
 * JSON manifest { "@pops/x": "<abs path to tgz>", … } to stdout.
 *
 * Usage: node scripts/extractability/pack-deps.mjs <unit-dir> <out-dir>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';

import { discoverUnits, resolveUnit } from './lib.mjs';

/** @param {string[]} argv */
function main(argv) {
  const [unitArg, outArg] = argv;
  if (!unitArg || !outArg) {
    process.stderr.write('usage: pack-deps.mjs <unit-dir> <out-dir>\n');
    return 2;
  }
  const cwd = process.cwd();
  const outDir = isAbsolute(outArg) ? outArg : resolve(cwd, outArg);
  mkdirSync(outDir, { recursive: true });

  const unit = resolveUnit(unitArg, cwd);
  const byName = new Map(discoverUnits(undefined, cwd).map((u) => [u.name, u]));

  const popsDeps = workspacePopsDeps(unit.pkg);
  /** @type {Record<string, string>} */
  const manifest = {};
  for (const depName of popsDeps) {
    const dep = byName.get(depName);
    if (!dep) {
      process.stderr.write(
        `pack-deps: ${depName} not found in workspace (declared by ${unit.name})\n`
      );
      return 1;
    }
    buildUnit(dep.dir);
    const tgz = packUnit(dep.dir, outDir);
    manifest[depName] = tgz;
  }
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  return 0;
}

/**
 * Returns the @pops/* deps declared with a workspace protocol (the edges that
 * must be rewritten for isolation). Spans dependencies + peerDependencies +
 * optionalDependencies (runtime surfaces); devDeps are not needed to build a
 * consumer of the packed unit.
 * @param {Record<string, unknown>} pkg
 */
function workspacePopsDeps(pkg) {
  /** @type {string[]} */
  const out = [];
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const block = pkg[field];
    if (block && typeof block === 'object') {
      for (const [name, spec] of Object.entries(block)) {
        if (
          name.startsWith('@pops/') &&
          typeof spec === 'string' &&
          spec.startsWith('workspace:')
        ) {
          if (!out.includes(name)) out.push(name);
        }
      }
    }
  }
  return out;
}

/** @param {string} dir */
function buildUnit(dir) {
  // stdout is reserved for the manifest JSON; build chatter must go to stderr
  // so the caller can capture stdout cleanly.
  execFileSync('pnpm', ['--filter', packageNameAt(dir), 'run', 'build'], {
    stdio: ['ignore', 2, 'inherit'],
  });
}

/** @param {string} dir */
function packageNameAt(dir) {
  return resolveUnit(dir).name;
}

/**
 * Packs a unit into outDir, returning the absolute tarball path.
 * @param {string} dir @param {string} outDir
 */
function packUnit(dir, outDir) {
  const before = new Set(safeReaddir(outDir));
  execFileSync('pnpm', ['pack', '--pack-destination', outDir], {
    cwd: dir,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const created = safeReaddir(outDir).filter((f) => f.endsWith('.tgz') && !before.has(f));
  if (created.length !== 1) {
    throw new Error(
      `pack-deps: expected exactly one new tarball in ${outDir}, got ${created.length}`
    );
  }
  return join(outDir, created[0]);
}

/** @param {string} dir */
function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

process.exit(main(process.argv.slice(2)));

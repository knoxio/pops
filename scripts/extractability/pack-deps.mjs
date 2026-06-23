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

  // Pack the TRANSITIVE @pops/* closure, not just the unit's direct edges. A
  // packed dep's tarball declares its own @pops/* deps as concrete versions
  // (pnpm pack rewrites `workspace:*` -> the version), which the isolated
  // install would otherwise try to fetch from the public registry and 404 on
  // (they are private workspace packages). Packing the whole closure and
  // pointing every @pops/* edge at its tarball (via pnpm.overrides, see
  // rewrite-deps.mjs) is what lets a unit with @pops/* runtime deps — e.g. a
  // pillar app importing its own pillar contract — install in isolation.
  /** @type {Record<string, string>} */
  const manifest = {};
  // Seed the closure with the unit's OWN edges INCLUDING devDependencies: the
  // proof we run is build (or typecheck+test for shell-bundled app units), and
  // those legitimately import workspace devDeps — e.g. `@pops/locales` provides
  // the JSON resources a finance/app test-setup imports. A consumer's devDeps
  // are not transitively installed, so the BFS expansion below stays
  // runtime-only (devDeps are pulled for the root unit alone).
  /** @type {string[]} */
  const queue = workspacePopsDeps(unit.pkg, true);
  const seen = new Set(queue);
  while (queue.length > 0) {
    const depName = /** @type {string} */ (queue.shift());
    const dep = byName.get(depName);
    if (!dep) {
      process.stderr.write(
        `pack-deps: ${depName} not found in workspace (declared in the closure of ${unit.name})\n`
      );
      return 1;
    }
    buildUnit(dep.dir);
    manifest[depName] = packUnit(dep.dir, outDir);
    for (const next of workspacePopsDeps(dep.pkg, false)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  return 0;
}

/**
 * Returns the @pops/* deps declared with a workspace protocol (the edges that
 * must be rewritten for isolation). Always spans dependencies +
 * peerDependencies + optionalDependencies (runtime surfaces); when
 * `includeDev` is set it also spans devDependencies — used only for the root
 * unit, whose own build/typecheck/test legitimately needs its workspace
 * devDeps. A consumer never installs a packed dep's devDeps, so the transitive
 * walk passes `includeDev=false`.
 *
 * @param {Record<string, unknown>} pkg
 * @param {boolean} includeDev
 */
function workspacePopsDeps(pkg, includeDev) {
  /** @type {string[]} */
  const out = [];
  const fields = includeDev
    ? ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']
    : ['dependencies', 'peerDependencies', 'optionalDependencies'];
  for (const field of fields) {
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

/**
 * Builds a packed dep so its `dist/` exists before `pnpm pack`. Source-only
 * `@pops/*` libs (e.g. `@pops/navigation`, `@pops/ui`, `@pops/locales`) ship
 * their `src/` directly — `main`/`exports` point at `./src/index.ts`, there is
 * no compile step and so no `build` script. Packing those as-is is correct (the
 * tarball carries the source the consumer resolves), so skip the build step for
 * them rather than erroring on a missing script — otherwise the sandbox could
 * never run on any unit that depends on a source-only lib (every pillar app
 * depends on `@pops/navigation`/`@pops/ui`).
 *
 * @param {string} dir
 */
function buildUnit(dir) {
  const scripts = resolveUnit(dir).pkg.scripts;
  const hasBuild =
    scripts &&
    typeof scripts === 'object' &&
    typeof (/** @type {Record<string, unknown>} */ (scripts).build) === 'string';
  if (!hasBuild) {
    process.stderr.write(
      `pack-deps: ${packageNameAt(dir)} has no build script (source-only lib) — packing src/ as-is.\n`
    );
    return;
  }
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

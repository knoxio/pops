#!/usr/bin/env node
/**
 * EX-2 helper — rewrite a copied unit's package.json for isolated install.
 *
 * Mutates ONLY where shared deps come from (the legal "extraction" mutation):
 *   - every `@pops/*: workspace:*` runtime dep  -> `file:<tarball>` from the manifest
 *   - any remaining `workspace:*` spec (e.g. a workspace devDep not packed) is
 *     dropped, so `pnpm install --ignore-workspace` doesn't fail resolving an
 *     unreachable workspace protocol. Dropping devDeps is safe: the sandbox
 *     proves the BUILD, and build/typecheck deps it actually needs are packed
 *     or external.
 *
 * Nothing else in the manifest changes — same source, same exports, same
 * external deps. If the unit's declared surface is incomplete, the isolated
 * install/build fails. That is the proof.
 *
 * Usage: node scripts/extractability/rewrite-deps.mjs <copied-package.json> <deps-manifest.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** @param {string[]} argv */
function main(argv) {
  const [pkgPath, manifestPath] = argv;
  if (!pkgPath || !manifestPath) {
    process.stderr.write('usage: rewrite-deps.mjs <package.json> <deps-manifest.json>\n');
    return 2;
  }
  /** @type {Record<string, unknown>} */
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  /** @type {Record<string, string>} */
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  for (const field of [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
    'devDependencies',
  ]) {
    const block = pkg[field];
    if (!block || typeof block !== 'object') continue;
    for (const [name, spec] of Object.entries(block)) {
      if (typeof spec !== 'string') continue;
      if (Object.prototype.hasOwnProperty.call(manifest, name)) {
        block[name] = `file:${manifest[name]}`;
      } else if (spec.startsWith('workspace:')) {
        delete block[name];
      }
    }
  }

  // peerDependencies on a packed @pops dep must also resolve from the tarball.
  const peers = pkg.peerDependencies;
  if (peers && typeof peers === 'object') {
    for (const [name] of Object.entries(peers)) {
      if (Object.prototype.hasOwnProperty.call(manifest, name)) {
        const deps =
          pkg.dependencies && typeof pkg.dependencies === 'object'
            ? pkg.dependencies
            : (pkg.dependencies = {});
        deps[name] = `file:${manifest[name]}`;
      }
    }
  }

  // Force the TRANSITIVE @pops/* edges to resolve from the packed tarballs too.
  // A packed dep's own manifest declares its @pops/* deps as concrete versions
  // (`@pops/types: 0.1.0` — pnpm pack froze the `workspace:*`), which the
  // isolated `--ignore-workspace` install would chase to the public registry
  // and 404 on. A pnpm `overrides` block keyed on each packed name pins the
  // whole tree to the tarballs, so the closure resolves entirely offline — the
  // faithful stand-in for "every @pops/* dep comes from a published artifact".
  if (Object.keys(manifest).length > 0) {
    const pnpmField =
      pkg.pnpm && typeof pkg.pnpm === 'object'
        ? /** @type {Record<string, unknown>} */ (pkg.pnpm)
        : (pkg.pnpm = {});
    const overrides =
      pnpmField.overrides && typeof pnpmField.overrides === 'object'
        ? /** @type {Record<string, string>} */ (pnpmField.overrides)
        : (pnpmField.overrides = {});
    for (const [name, tgz] of Object.entries(manifest)) {
      overrides[name] = `file:${tgz}`;
    }
  }

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  process.stdout.write(
    `rewrote ${pkgPath} (${Object.keys(manifest).length} @pops dep(s) -> file:)\n`
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));

#!/usr/bin/env node
/**
 * check-package-scripts.mjs
 *
 * Enforces that every workspace package exposes a consistent set of scripts
 * so the monorepo's CI/quality tooling can rely on them uniformly.
 *
 * For each workspace package listed in `pnpm-workspace.yaml`, this script
 * verifies the `package.json` declares:
 *
 *   - `typecheck`
 *   - `lint` / `lint:fix`
 *   - `format:check` / `format:fix`
 *   - `test`
 *   - `ci:fix`
 *
 * The `ci:fix` script must run — in order — format:fix, lint:fix, typecheck,
 * format:check, lint. A package that legitimately has no tests can opt out by
 * declaring a `test` that simply echoes a message (so `pnpm -r test` still
 * succeeds). Fails the process with a non-zero exit code on any violation.
 */
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_SCRIPTS = [
  "typecheck",
  "lint",
  "lint:fix",
  "format:check",
  "format:fix",
  "test",
  "ci:fix",
];

/**
 * ci:fix must execute the full quality sequence in this order:
 *   format:fix → lint:fix → typecheck → format:check → lint
 */
const CI_FIX_REQUIRED_TOKENS = [
  "format:fix",
  "lint:fix",
  "typecheck",
  "format:check",
  "lint",
];

/**
 * Strip an unquoted `# comment` tail from a YAML line. Does not attempt to
 * handle `#` characters that appear inside quoted strings, which is fine for
 * our usage (workspace globs never contain `#`).
 */
function stripYamlComment(line) {
  const hashIdx = line.indexOf("#");
  return hashIdx === -1 ? line : line.slice(0, hashIdx);
}

/**
 * Read `pnpm-workspace.yaml` and return the list of glob entries under the
 * top-level `packages:` key. Intentionally avoids a YAML dependency — the file
 * shape is simple and stable — but handles comments and blank lines robustly.
 */
function readWorkspaceGlobs() {
  const raw = readFileSync(join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8");
  const globs = [];
  let inPackages = false;
  for (const rawLine of raw.split("\n")) {
    const line = stripYamlComment(rawLine).trimEnd();
    if (line.trim() === "") continue;
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const match = line.match(/^\s*-\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/);
    if (match) {
      globs.push(match[1] ?? match[2] ?? match[3]);
    } else if (/^\S/.test(line)) {
      // Top-level key — end of `packages:` block.
      break;
    }
  }
  return globs;
}

/** Expand a simple `apps/*`-style glob into concrete package directories. */
async function expandGlob(glob) {
  if (!glob.includes("*")) {
    return [join(REPO_ROOT, glob)];
  }
  const starIdx = glob.indexOf("*");
  const parent = glob.slice(0, starIdx).replace(/\/$/, "");
  const parentAbs = join(REPO_ROOT, parent);
  let entries;
  try {
    entries = await readdir(parentAbs, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        `Workspace glob "${glob}" points at missing directory "${parent}" — ` +
          `update pnpm-workspace.yaml or create the directory.`,
      );
    }
    throw new Error(
      `Failed to read workspace glob "${glob}" at "${parent}": ${err.message}`,
    );
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(parentAbs, entry.name));
}

/**
 * Validate a single `package.json`. Returns an array of human-readable errors;
 * an empty array means the package is compliant.
 */
function validatePackage(pkgJsonPath, pkg) {
  const errors = [];
  const scripts = pkg.scripts ?? {};

  for (const name of REQUIRED_SCRIPTS) {
    if (!scripts[name] || !scripts[name].trim()) {
      errors.push(`missing script "${name}"`);
    }
  }

  const ciFix = scripts["ci:fix"];
  if (ciFix) {
    // Match each required token with a word boundary so "lint" does not match
    // the "lint" inside "lint:fix". Track the *first* occurrence of each
    // token as its position for ordering checks.
    const occurrences = CI_FIX_REQUIRED_TOKENS.map((token) => {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<![\\w:])${escaped}(?![\\w:])`);
      const match = ciFix.match(re);
      return { token, idx: match?.index ?? -1 };
    });
    for (const { token, idx } of occurrences) {
      if (idx === -1) {
        errors.push(`"ci:fix" is missing step "${token}" (got: ${ciFix})`);
      }
    }
    const present = occurrences.filter((entry) => entry.idx !== -1);
    for (let i = 1; i < present.length; i += 1) {
      if (present[i].idx < present[i - 1].idx) {
        errors.push(
          `"ci:fix" runs "${present[i].token}" before "${present[i - 1].token}"; expected order: ${CI_FIX_REQUIRED_TOKENS.join(" → ")}`,
        );
        break;
      }
    }
  }

  return errors;
}

async function main() {
  const globs = readWorkspaceGlobs();
  if (globs.length === 0) {
    console.error("No workspace entries found in pnpm-workspace.yaml");
    process.exit(1);
  }

  const seen = new Set();
  const packages = [];
  for (const glob of globs) {
    for (const dir of await expandGlob(glob)) {
      if (seen.has(dir)) continue;
      seen.add(dir);
      // Only include directories that actually ship a package.json. A
      // workspace glob like `apps/*` will match ancillary folders such as
      // `apps/moltbot` (a Python-adjacent service with no Node manifest).
      if (!existsSync(join(dir, "package.json"))) continue;
      packages.push(dir);
    }
  }

  const failures = [];
  for (const dir of packages.sort()) {
    const pkgJsonPath = join(dir, "package.json");
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    } catch (err) {
      failures.push({ dir, errors: [`cannot read package.json: ${err.message}`] });
      continue;
    }
    const errors = validatePackage(pkgJsonPath, pkg);
    if (errors.length > 0) {
      failures.push({ dir, name: pkg.name, errors });
    }
  }

  if (failures.length === 0) {
    console.log(`All ${packages.length} workspace packages expose the required scripts.`);
    return;
  }

  console.error(
    `\nPackage-script check failed for ${failures.length} package(s):\n`,
  );
  for (const failure of failures) {
    const label = failure.name ?? failure.dir;
    console.error(`  ✖ ${label} (${failure.dir})`);
    for (const err of failure.errors) {
      console.error(`      - ${err}`);
    }
  }
  console.error(
    "\nEvery workspace package must declare: " +
      REQUIRED_SCRIPTS.map((s) => `"${s}"`).join(", ") +
      ".\n`ci:fix` must run: " +
      CI_FIX_REQUIRED_TOKENS.join(" → ") +
      ".\n",
  );
  process.exit(1);
}

await main();

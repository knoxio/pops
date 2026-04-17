import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Groups absolute file paths by their nearest package root (apps/* or packages/*).
 * Files outside those directories are grouped under the repo root.
 */
function groupByPackage(filenames) {
  const groups = {};
  for (const f of filenames) {
    const rel = path.relative(root, f);
    const parts = rel.split(path.sep);
    const pkgDir =
      (parts[0] === 'apps' || parts[0] === 'packages') && parts.length > 1
        ? path.join(root, parts[0], parts[1])
        : root;
    (groups[pkgDir] ||= []).push(f);
  }
  return groups;
}

/** Shell-escape a path for use inside a bash -c string. */
function esc(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export default {
  '*.{ts,tsx}': (filenames) => {
    const groups = groupByPackage(filenames);
    const formatFiles = filenames.map(esc).join(' ');

    // 1. oxfmt --write  (auto-fix formatting)
    // 2. eslint --fix   (auto-fix lint, per-package CWD so config resolves)
    // 3. oxfmt --check  (verify formatting)
    // 4. eslint         (verify lint)
    return [
      `oxfmt --write ${formatFiles}`,
      ...Object.entries(groups).map(
        ([pkgDir, files]) =>
          `bash -c 'cd ${esc(pkgDir)} && eslint --fix ${files.map(esc).join(' ')}'`
      ),
      `oxfmt --check ${formatFiles}`,
      ...Object.entries(groups).map(
        ([pkgDir, files]) => `bash -c 'cd ${esc(pkgDir)} && eslint ${files.map(esc).join(' ')}'`
      ),
    ];
  },

  '*.css': ['oxfmt --write', 'oxfmt --check'],
};

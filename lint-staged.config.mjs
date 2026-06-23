/** Shell-escape a path for use inside a bash -c string. */
function esc(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export default {
  '*.{js,jsx,ts,tsx,mjs,cjs}': (filenames) => {
    const formatFiles = filenames.map(esc).join(' ');

    // 1. oxlint --fix  (auto-fix lint issues; --no-error-on-unmatched-pattern
    //    so commits touching only lint-ignored files (e.g. *.config.ts)
    //    still pass through the pre-commit hook)
    // 2. oxfmt --write (auto-fix formatting and import sort)
    return [
      `oxlint --fix --no-error-on-unmatched-pattern ${formatFiles}`,
      `oxfmt --write ${formatFiles}`,
    ];
  },

  '*.{json,md,css}': (filenames) => {
    // Never reformat an OpenAPI snapshot: a pillar's canonical
    // `**/openapi/<name>.openapi.json` is emitted by codegen, and a vendored
    // copy under `**/app/contracts/<name>.openapi.json` must stay byte-identical
    // to it (the check-vendored-contracts drift gate enforces equality).
    // Formatting either would create silent drift at commit time.
    const isOpenApiSnapshot = (/** @type {string} */ f) =>
      /\/openapi\/[^/]+\.openapi\.json$/.test(f) ||
      /\/app\/contracts\/[^/]+\.openapi\.json$/.test(f);
    const formattable = filenames.filter((f) => !isOpenApiSnapshot(f));
    if (formattable.length === 0) return [];
    const formatFiles = formattable.map(esc).join(' ');
    return [`oxfmt --write ${formatFiles}`];
  },
};

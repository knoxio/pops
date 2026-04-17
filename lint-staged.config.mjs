/** Shell-escape a path for use inside a bash -c string. */
function esc(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export default {
  '*.{js,jsx,ts,tsx,mjs,cjs}': (filenames) => {
    const formatFiles = filenames.map(esc).join(' ');

    // 1. oxlint --fix  (auto-fix lint issues)
    // 2. oxfmt --write (auto-fix formatting and import sort)
    return [`oxlint --fix ${formatFiles}`, `oxfmt --write ${formatFiles}`];
  },

  '*.{json,md,css}': (filenames) => {
    const formatFiles = filenames.map(esc).join(' ');
    return [`oxfmt --write ${formatFiles}`];
  },
};

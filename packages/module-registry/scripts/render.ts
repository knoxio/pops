/**
 * TypeScript-source renderers for the build-time registry (`generated.ts`).
 * Split out of `lib.ts` to keep that file under the project's max-lines
 * budget. Pure functions over the `SerialisableModule` projection — no IO.
 */
import type { SerialisableModule } from './lib.js';

function quote(value: string): string {
  return `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}'`;
}

/**
 * Emit a pure-data value as a TypeScript literal. Strings round-trip through
 * `quote()` (so they match the project's single-quote oxfmt style);
 * everything else delegates to `JSON.stringify` which is sufficient for the
 * shapes we emit (no `undefined`, no functions).
 */
function literal(value: unknown, indent: string): string {
  if (typeof value === 'string') return quote(value);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const inner = value.map((v) => `${indent}  ${literal(v, `${indent}  `)}`).join(',\n');
    return `[\n${inner},\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined
  );
  if (entries.length === 0) return '{}';
  const inner = entries
    .map(([k, v]) => `${indent}  ${k}: ${literal(v, `${indent}  `)}`)
    .join(',\n');
  return `{\n${inner},\n${indent}}`;
}

function renderModule(m: SerialisableModule): string {
  const lines: string[] = ['  {'];
  lines.push(`    id: ${quote(m.id)},`);
  lines.push(`    name: ${quote(m.name)},`);
  if (m.version !== undefined) lines.push(`    version: ${quote(m.version)},`);
  lines.push(`    surfaces: [${m.surfaces.map(quote).join(', ')}] as const,`);
  if (m.description !== undefined) lines.push(`    description: ${quote(m.description)},`);
  if (m.dependsOn !== undefined) {
    lines.push(`    dependsOn: [${m.dependsOn.map(quote).join(', ')}] as const,`);
  }
  if (m.capabilities !== undefined) {
    lines.push(`    capabilities: [${m.capabilities.map(quote).join(', ')}] as const,`);
  }
  lines.push(`    hasBackend: ${m.hasBackend},`);
  lines.push(`    hasFrontend: ${m.hasFrontend},`);
  if (m.overlay !== undefined) {
    const inner = [`chromeSlot: ${quote(m.overlay.chromeSlot)}`];
    if (m.overlay.shortcut !== undefined) {
      inner.push(`shortcut: ${quote(m.overlay.shortcut)}`);
    }
    lines.push(`    overlay: { ${inner.join(', ')} },`);
  }
  if (m.settings !== undefined) {
    lines.push(
      `    settings: ${literal(m.settings, '    ')} satisfies readonly SettingsManifest[],`
    );
  }
  lines.push('  }');
  return lines.join('\n');
}

const HEADER = [
  '/**',
  ' * GENERATED FILE — do not edit by hand.',
  ' *',
  ' * Built from `packages/module-registry/scripts/known-modules.ts` by',
  ' * `pnpm registry:build`. CI verifies this file is up to date; commit',
  ' * regenerated output alongside any change to the source manifest list.',
  ' *',
  ' * See `docs/themes/01-foundation/prds/101-plugin-contract/us-02-build-time-registry.md`.',
  ' */',
].join('\n');

/**
 * Render the generated TypeScript source for a sorted list of modules.
 * Single-quoted strings and explicit `as const` tuples are emitted so the
 * output matches the project's oxfmt style and so consumers get exact
 * literal narrowing on `id` and `surfaces`.
 */
export function renderFile(modules: readonly SerialisableModule[]): string {
  const idLiteralUnion = modules.map((m) => quote(m.id)).join(' | ');

  const knownModulesLine =
    modules.length === 0
      ? 'export const KNOWN_MODULES: readonly string[] = [] as const;'
      : `export const KNOWN_MODULES = [${modules.map((m) => quote(m.id)).join(', ')}] as const;`;

  const modulesBody = modules.length === 0 ? '' : `\n${modules.map(renderModule).join(',\n')},\n`;

  const idTypeLine =
    modules.length === 0
      ? 'export type GeneratedModuleId = never;'
      : `export type GeneratedModuleId = ${idLiteralUnion};`;

  const needsSettingsImport = modules.some((m) => m.settings !== undefined);
  const importLine = needsSettingsImport
    ? "import type { SettingsManifest } from '@pops/types';\n\n"
    : '';

  return [
    HEADER,
    '',
    importLine + knownModulesLine,
    '',
    `export const MODULES = [${modulesBody}] as const;`,
    '',
    idTypeLine,
    '',
  ].join('\n');
}

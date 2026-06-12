/**
 * TypeScript public-surface extractor for contract packages.
 *
 * Why custom and not api-extractor: api-extractor expects a single rollup
 * entry point and a global `.api.md` snapshot. Our contract packages
 * export multiple sub-paths (`/types`, `/schemas`, `/router`, `/errors`,
 * `/manifest`) each with their own `.d.ts`, and the router type is
 * deliberately a type-only re-export of `@pops/finance-api/router` — a
 * graph api-extractor does not love. A direct AST pass over the emitted
 * `.d.ts` files for each declared export gives us the exact granularity
 * we want (per-entry-point symbol list with normalised signature text)
 * with no extra runtime dep.
 *
 * The surface JSON has a stable, sorted shape so `git diff` only shows
 * meaningful changes — entries are sorted by `entry` then `name`, and
 * the signature text is whatever the TypeScript printer emits for the
 * declaration node (post-normalisation of whitespace).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import ts from 'typescript';

import type { TsSurface, TsSurfaceEntry } from './types.js';

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly exports?: Record<string, ExportConditions | string>;
  readonly types?: string;
  readonly main?: string;
}

type ExportConditions = {
  readonly types?: string;
  readonly default?: string;
};

const PRINTER = ts.createPrinter({
  removeComments: true,
  newLine: ts.NewLineKind.LineFeed,
  omitTrailingSemicolon: false,
});

function readPackageJson(packageDir: string): PackageManifest {
  const raw = readFileSync(resolve(packageDir, 'package.json'), 'utf8');
  return JSON.parse(raw) as PackageManifest;
}

function collectEntryPoints(pkg: PackageManifest): { name: string; typesPath: string }[] {
  const out: { name: string; typesPath: string }[] = [];
  if (pkg.exports) {
    for (const [name, value] of Object.entries(pkg.exports)) {
      if (typeof value === 'string') continue;
      const types = value.types;
      if (!types) continue;
      if (!types.endsWith('.d.ts')) continue;
      out.push({ name, typesPath: types });
    }
  } else if (pkg.types) {
    out.push({ name: '.', typesPath: pkg.types });
  }
  return out;
}

function normaliseWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function entryKind(node: ts.Node): TsSurfaceEntry['kind'] {
  if (ts.isInterfaceDeclaration(node)) return 'interface';
  if (ts.isTypeAliasDeclaration(node)) return 'type';
  if (ts.isFunctionDeclaration(node)) return 'function';
  if (ts.isClassDeclaration(node)) return 'class';
  if (ts.isEnumDeclaration(node)) return 'enum';
  if (ts.isVariableStatement(node)) return 'variable';
  if (ts.isModuleDeclaration(node)) return 'namespace';
  return 'reexport';
}

function entryName(node: ts.Node): string | null {
  if (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node)
  ) {
    return node.name?.getText() ?? null;
  }
  if (ts.isVariableStatement(node)) {
    const first = node.declarationList.declarations[0];
    return first?.name.getText() ?? null;
  }
  return null;
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function collectFromSourceFile(
  sourceFile: ts.SourceFile,
  entry: string,
  resolveImport: (specifier: string, fromFile: string) => string | null,
  visited: Set<string>
): TsSurfaceEntry[] {
  if (visited.has(sourceFile.fileName)) return [];
  visited.add(sourceFile.fileName);

  const out: TsSurfaceEntry[] = [];

  for (const node of sourceFile.statements) {
    if (ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier)) {
        const target = resolveImport(specifier.text, sourceFile.fileName);
        if (target) {
          const child = ts.createSourceFile(
            target,
            readFileSync(target, 'utf8'),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
          );
          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            const childEntries = collectFromSourceFile(child, entry, resolveImport, visited);
            const wanted = new Set(
              node.exportClause.elements.map((el) => (el.propertyName ?? el.name).getText())
            );
            for (const e of childEntries) {
              if (wanted.has(e.name)) out.push({ ...e, entry });
            }
          } else {
            out.push(...collectFromSourceFile(child, entry, resolveImport, visited));
          }
          continue;
        }
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          const exportedName = el.name.getText();
          const text = normaliseWhitespace(
            PRINTER.printNode(ts.EmitHint.Unspecified, el, sourceFile)
          );
          out.push({ entry, name: exportedName, kind: 'reexport', text });
        }
      }
      continue;
    }

    if (!hasExportModifier(node)) continue;
    const name = entryName(node);
    if (!name) continue;
    const text = normaliseWhitespace(PRINTER.printNode(ts.EmitHint.Unspecified, node, sourceFile));
    out.push({ entry, name, kind: entryKind(node), text });
  }

  return out;
}

export function extractTsSurface(packageDir: string): TsSurface {
  const pkg = readPackageJson(packageDir);
  const entryPoints = collectEntryPoints(pkg);

  const resolveImport = (specifier: string, fromFile: string): string | null => {
    if (!specifier.startsWith('.')) return null;
    const baseDir = dirname(fromFile);
    const noExt = specifier.replace(/\.js$/, '');
    const candidates = [`${noExt}.d.ts`, `${noExt}/index.d.ts`];
    for (const c of candidates) {
      const abs = resolve(baseDir, c);
      try {
        readFileSync(abs);
        return abs;
      } catch {
        continue;
      }
    }
    return null;
  };

  const entries: TsSurfaceEntry[] = [];
  for (const { name, typesPath } of entryPoints) {
    const absPath = resolve(packageDir, typesPath);
    const source = readFileSync(absPath, 'utf8');
    const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    entries.push(...collectFromSourceFile(sf, name, resolveImport, new Set()));
  }

  const seen = new Set<string>();
  const deduped: TsSurfaceEntry[] = [];
  for (const e of entries) {
    const key = `${e.entry}::${e.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }

  deduped.sort((a, b) => {
    if (a.entry !== b.entry) return a.entry < b.entry ? -1 : 1;
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  return {
    contract: pkg.name,
    version: pkg.version,
    entries: deduped,
  };
}

export function serialiseTsSurface(surface: TsSurface): string {
  return `${JSON.stringify(surface, null, 2)}\n`;
}

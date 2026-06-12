import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { extractTsSurface } from '../extract-ts.js';

import type { TsSurface } from '../types.js';

let FIXTURE_DIR: string;

function setupFixture(): void {
  const dist = resolve(FIXTURE_DIR, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(
    resolve(FIXTURE_DIR, 'package.json'),
    JSON.stringify(
      {
        name: '@fixtures/tiny-contract',
        version: '1.0.0',
        type: 'module',
        exports: {
          '.': { types: './dist/index.d.ts', default: './dist/index.js' },
          './schemas': { types: './dist/schemas.d.ts', default: './dist/schemas.js' },
        },
      },
      null,
      2
    ) + '\n'
  );
  writeFileSync(
    resolve(dist, 'index.d.ts'),
    `export interface Foo {\n    a: string;\n    b: number;\n}\nexport type Bar = 'x' | 'y';\nexport declare function hi(name: string): string;\n`
  );
  writeFileSync(
    resolve(dist, 'schemas.d.ts'),
    `export declare const FooSchema: { parse(input: unknown): unknown };\n`
  );
}

beforeAll(() => {
  FIXTURE_DIR = mkdtempSync(resolve(tmpdir(), 'extract-ts-fixture-'));
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

describe('extractTsSurface', () => {
  it('returns the public surface for each declared sub-path', () => {
    setupFixture();
    const surface: TsSurface = extractTsSurface(FIXTURE_DIR);
    expect(surface.contract).toBe('@fixtures/tiny-contract');
    expect(surface.version).toBe('1.0.0');
    expect(surface.entries.map((e) => `${e.entry}::${e.name}`)).toEqual([
      '.::Bar',
      '.::Foo',
      '.::hi',
      './schemas::FooSchema',
    ]);
  });

  it('preserves kind tags', () => {
    setupFixture();
    const surface = extractTsSurface(FIXTURE_DIR);
    const find = (name: string) => surface.entries.find((e) => e.name === name);
    expect(find('Foo')?.kind).toBe('interface');
    expect(find('Bar')?.kind).toBe('type');
    expect(find('hi')?.kind).toBe('function');
    expect(find('FooSchema')?.kind).toBe('variable');
  });

  it('emits entries sorted by entry then name (stable)', () => {
    setupFixture();
    const surface = extractTsSurface(FIXTURE_DIR);
    const entries = surface.entries;
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const cur = entries[i];
      if (!prev || !cur) continue;
      if (prev.entry === cur.entry) {
        expect(prev.name <= cur.name).toBe(true);
      } else {
        expect(prev.entry < cur.entry).toBe(true);
      }
    }
  });
});

describe('fixture sanity', () => {
  it('writes into a known fixture directory', () => {
    setupFixture();
    expect(existsSync(resolve(FIXTURE_DIR, 'dist', 'index.d.ts'))).toBe(true);
  });
});

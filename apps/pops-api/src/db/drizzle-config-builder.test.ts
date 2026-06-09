/**
 * Unit tests for the per-pillar drizzle-kit config builder (P1).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildPillarDrizzleConfig } from './drizzle-config-builder.js';

const SQLITE_PATH = 'SQLITE_PATH';
let originalSqlitePath: string | undefined;

beforeEach(() => {
  originalSqlitePath = process.env[SQLITE_PATH];
  delete process.env[SQLITE_PATH];
});

afterEach(() => {
  if (originalSqlitePath === undefined) delete process.env[SQLITE_PATH];
  else process.env[SQLITE_PATH] = originalSqlitePath;
});

describe('buildPillarDrizzleConfig', () => {
  it('returns sqlite dialect with the supplied schema glob and out dir', () => {
    const config = buildPillarDrizzleConfig({
      pillarId: 'core',
      schemaGlob: './src/schema/**/*.ts',
      outDir: './migrations',
    });
    expect(config.dialect).toBe('sqlite');
    expect(config.schema).toBe('./src/schema/**/*.ts');
    expect(config.out).toBe('./migrations');
  });

  it('routes a real pillar to a per-pillar SQLite path by default', () => {
    const config = buildPillarDrizzleConfig({
      pillarId: 'food',
      schemaGlob: './src/schema/**/*.ts',
      outDir: './migrations',
    });
    expect(config.dbCredentials).toEqual({ url: './data/food.db' });
  });

  it('routes the legacy "shared" pillar to the historical shared SQLite path', () => {
    const config = buildPillarDrizzleConfig({
      pillarId: 'shared',
      schemaGlob: '../../packages/db-types/src/schema/*',
      outDir: './src/db/drizzle-migrations',
    });
    expect(config.dbCredentials).toEqual({ url: './data/pops.db' });
  });

  it('prefers SQLITE_PATH over the per-pillar default', () => {
    process.env[SQLITE_PATH] = '/tmp/override.db';
    const config = buildPillarDrizzleConfig({
      pillarId: 'food',
      schemaGlob: './src/schema/**/*.ts',
      outDir: './migrations',
    });
    expect(config.dbCredentials).toEqual({ url: '/tmp/override.db' });
  });

  it('honours an explicit sqlitePathOverride above both env and pillar default', () => {
    process.env[SQLITE_PATH] = '/tmp/env.db';
    const config = buildPillarDrizzleConfig({
      pillarId: 'food',
      schemaGlob: './src/schema/**/*.ts',
      outDir: './migrations',
      sqlitePathOverride: '/explicit/food.db',
    });
    expect(config.dbCredentials).toEqual({ url: '/explicit/food.db' });
  });

  it('treats an empty SQLITE_PATH the same as unset', () => {
    process.env[SQLITE_PATH] = '';
    const config = buildPillarDrizzleConfig({
      pillarId: 'media',
      schemaGlob: './src/schema/**/*.ts',
      outDir: './migrations',
    });
    expect(config.dbCredentials).toEqual({ url: './data/media.db' });
  });
});

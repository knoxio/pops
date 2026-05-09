import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetInstalledModulesCache,
  KNOWN_APPS,
  KNOWN_OVERLAYS,
  readInstalledModules,
} from './env-modules.js';

const APP_KEY = 'POPS_APPS';
const OVERLAY_KEY = 'POPS_OVERLAYS';

describe('PRD-100 env-modules', () => {
  let originalApps: string | undefined;
  let originalOverlays: string | undefined;

  beforeEach(() => {
    originalApps = process.env[APP_KEY];
    originalOverlays = process.env[OVERLAY_KEY];
    delete process.env[APP_KEY];
    delete process.env[OVERLAY_KEY];
    __resetInstalledModulesCache();
  });

  afterEach(() => {
    if (originalApps === undefined) delete process.env[APP_KEY];
    else process.env[APP_KEY] = originalApps;
    if (originalOverlays === undefined) delete process.env[OVERLAY_KEY];
    else process.env[OVERLAY_KEY] = originalOverlays;
    __resetInstalledModulesCache();
  });

  it('returns all known modules when env vars are unset', () => {
    const installed = readInstalledModules();
    expect(installed.apps).toEqual(KNOWN_APPS);
    expect(installed.overlays).toEqual(KNOWN_OVERLAYS);
  });

  it('returns all known modules when env vars are empty strings', () => {
    process.env[APP_KEY] = '';
    process.env[OVERLAY_KEY] = '   ';
    const installed = readInstalledModules();
    expect(installed.apps).toEqual(KNOWN_APPS);
    expect(installed.overlays).toEqual(KNOWN_OVERLAYS);
  });

  it('parses a single app and trims whitespace', () => {
    process.env[APP_KEY] = ' finance  ';
    const installed = readInstalledModules();
    expect(installed.apps).toEqual(['finance']);
  });

  it('parses a comma-separated list and deduplicates', () => {
    process.env[APP_KEY] = 'finance,inventory,finance';
    const installed = readInstalledModules();
    expect(installed.apps).toEqual(['finance', 'inventory']);
  });

  it('throws on unknown app id, naming the bad value and valid set', () => {
    process.env[APP_KEY] = 'finance,not-a-real-module';
    expect(() => readInstalledModules()).toThrow(/not-a-real-module/);
  });

  it('throws on unknown overlay id', () => {
    process.env[OVERLAY_KEY] = 'ego,does-not-exist';
    expect(() => readInstalledModules()).toThrow(/does-not-exist/);
  });

  it('throws on a value that parses to an empty list (only commas/whitespace)', () => {
    process.env[APP_KEY] = ',,';
    expect(() => readInstalledModules()).toThrow(/empty list/);
  });

  it('throws on overlay value that parses to an empty list', () => {
    process.env[OVERLAY_KEY] = ', ,';
    expect(() => readInstalledModules()).toThrow(/POPS_OVERLAYS.*empty list/);
  });

  it('preserves operator-specified app ordering', () => {
    process.env[APP_KEY] = 'media,finance,cerebrum';
    const installed = readInstalledModules();
    expect(installed.apps).toEqual(['media', 'finance', 'cerebrum']);
  });

  it('caches the result so repeat calls do not re-parse env', () => {
    process.env[APP_KEY] = 'finance';
    const first = readInstalledModules();
    process.env[APP_KEY] = 'media';
    const second = readInstalledModules();
    expect(second).toBe(first);
    expect(second.apps).toEqual(['finance']);
  });
});

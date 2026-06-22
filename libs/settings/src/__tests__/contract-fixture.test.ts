import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { makeSettingsContract } from '../contract.js';
import { REDACTED } from '../redact.js';
import fixture from './settings.fixture.json' with { type: 'json' };

/**
 * Cross-language golden-fixture parity test.
 *
 * `settings.fixture.json` is the SHARED wire fixture — byte-identical to
 * `crates/pops-settings/tests/fixtures/settings.json`. The Rust contract test
 * asserts each section round-trips its typed wire struct byte-for-byte; this
 * test asserts the SAME fixture is contract-schema-clean on the TS side.
 * Together they pin one federated RU+reset wire across both languages.
 *
 * This side is deliberately tolerant of compact JSON and key order (zod
 * `.parse` ignores both) — the byte-level pin lives on the Rust side, where
 * `serde_json` re-emits sorted keys. What this test guards is that every
 * section the Rust types accept is ALSO valid under the authoritative ts-rest
 * contract schemas, so neither language can drift the shape unilaterally.
 */
const errors = { 401: z.object({ message: z.string() }) };
const contract = makeSettingsContract(['theme', 'core.appName', 'finance.apiToken'], errors);

/** Pull a route's 200-response schema off the built contract. */
function okResponse(route: keyof typeof contract): z.ZodType {
  return (contract[route].responses as Record<number, z.ZodType>)[200];
}

describe('shared settings wire fixture', () => {
  it('validates `setting` against the SettingSchema element', () => {
    const SettingSchema = z.object({ key: z.string(), value: z.string() });
    expect(() => SettingSchema.parse(fixture.setting)).not.toThrow();
  });

  it('validates `listResponse` against the list 200 response', () => {
    expect(() => okResponse('list').parse(fixture.listResponse)).not.toThrow();
  });

  it('validates `getResponse` and the explicit-null `getResponseNull`', () => {
    expect(() => okResponse('get').parse(fixture.getResponse)).not.toThrow();
    expect(() => okResponse('get').parse(fixture.getResponseNull)).not.toThrow();
    expect(fixture.getResponseNull.data).toBeNull();
  });

  it('validates `settingsMapResponse` against the get-many 200 response', () => {
    expect(() => okResponse('getMany').parse(fixture.settingsMapResponse)).not.toThrow();
  });

  it('validates `resetResponse` against the reset 200 response', () => {
    expect(() => okResponse('reset').parse(fixture.resetResponse)).not.toThrow();
  });

  it('validates `mutationResponse` against the set 200 response', () => {
    expect(() => okResponse('set').parse(fixture.mutationResponse)).not.toThrow();
  });

  it('carries the `__redacted__` sentinel byte-identical to the Rust REDACTED constant', () => {
    expect(REDACTED).toBe('__redacted__');
    const masked = fixture.listResponse.data.find((s) => s.key === 'finance.apiToken');
    expect(masked?.value).toBe(REDACTED);
    expect(fixture.settingsMapResponse.settings['finance.apiToken']).toBe(REDACTED);
  });

  it('exposes no create or delete verb (parity with the Rust operationId set)', () => {
    expect(contract).not.toHaveProperty('create');
    expect(contract).not.toHaveProperty('delete');
    expect(Object.keys(contract).toSorted()).toEqual(
      ['ensure', 'get', 'getMany', 'list', 'reset', 'resetKey', 'set', 'setMany'].toSorted()
    );
  });
});

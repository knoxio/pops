import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { InferenceRecordSchema } from '../record-schema.js';

/**
 * Cross-language golden-fixture parity test.
 *
 * `fixtures/record.json` is the SHARED wire fixture — byte-identical to
 * `crates/pops-ai/tests/fixtures/record.json`. The Rust contract test asserts
 * its `InferenceRecord` round-trips these exact bytes; here we assert the TS
 * schema (a) accepts the same bytes and (b) re-serializes (compact) back to
 * them. Together they pin ONE wire across both languages: any camelCase /
 * kebab-case-enum / field-order drift fails on one side or the other.
 */
const fixturePath = fileURLToPath(new URL('./fixtures/record.json', import.meta.url));
const fixtureBytes = readFileSync(fixturePath, 'utf8').trimEnd();

describe('InferenceRecord golden fixture (Rust ↔ TS parity)', () => {
  it('parses the shared fixture clean', () => {
    const parsed = InferenceRecordSchema.safeParse(JSON.parse(fixtureBytes));
    expect(parsed.success).toBe(true);
  });

  it('round-trips to the same compact bytes the Rust crate serializes', () => {
    const record = InferenceRecordSchema.parse(JSON.parse(fixtureBytes));
    // zod builds the output object in schema-declaration order, which matches
    // the fixture's key order (the Rust struct field order). Compact
    // JSON.stringify must therefore reproduce the fixture byte-for-byte.
    expect(JSON.stringify(record)).toBe(fixtureBytes);
  });

  it('pins the widened status + camelCase token keys the wire carries', () => {
    const record = InferenceRecordSchema.parse(JSON.parse(fixtureBytes));
    expect(record.status).toBe('budget-blocked');
    expect(record.inputTokens).toBe(1280);
    expect(record.outputTokens).toBe(640);
    expect(record.contextId).toBe('import_batch:42');
  });
});

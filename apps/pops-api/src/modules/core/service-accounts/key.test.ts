/**
 * Unit tests for the API-key generator + hash + verify primitives. The hot
 * verify path runs on every authenticated machine call so the constant-time
 * compare must not be regressed.
 */
import { describe, expect, it } from 'vitest';

import { generateApiKey, parseApiKey, verifySecret } from './key.js';

describe('generateApiKey', () => {
  it('produces a marker-prefixed key with an 8-char prefix and a long secret', async () => {
    const issued = await generateApiKey();
    expect(issued.plaintext.startsWith('pops_sa_')).toBe(true);
    expect(issued.prefix).toHaveLength(8);
    expect(issued.plaintext).toContain(`${issued.prefix}.`);
    expect(issued.hash.startsWith('scrypt$')).toBe(true);
  });

  it('produces unique keys on repeated calls', async () => {
    const a = await generateApiKey();
    const b = await generateApiKey();
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.prefix).not.toBe(b.prefix);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('parseApiKey', () => {
  it('rejects values without the marker', () => {
    expect(parseApiKey('not-a-key')).toBeNull();
    expect(parseApiKey('Bearer abc')).toBeNull();
  });

  it('rejects malformed body (missing dot)', () => {
    expect(parseApiKey('pops_sa_abc12345nodothere')).toBeNull();
  });

  it('rejects malformed body (prefix not 8 chars)', () => {
    expect(parseApiKey('pops_sa_short.secret')).toBeNull();
  });

  it('rejects empty secret half', () => {
    expect(parseApiKey('pops_sa_abc12345.')).toBeNull();
  });

  it('parses a valid key', () => {
    const parsed = parseApiKey('pops_sa_abc12345.secretpart');
    expect(parsed).toEqual({ prefix: 'abc12345', secret: 'secretpart' });
  });

  it('round-trips with generateApiKey', async () => {
    const issued = await generateApiKey();
    const parsed = parseApiKey(issued.plaintext);
    expect(parsed?.prefix).toBe(issued.prefix);
    expect(parsed?.secret).toBeTruthy();
  });
});

describe('verifySecret', () => {
  it('returns true for the correct secret', async () => {
    const issued = await generateApiKey();
    const parsed = parseApiKey(issued.plaintext);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('unreachable');
    await expect(verifySecret(parsed.secret, issued.hash)).resolves.toBe(true);
  });

  it('returns false for a wrong secret', async () => {
    const issued = await generateApiKey();
    await expect(verifySecret('wrong-secret', issued.hash)).resolves.toBe(false);
  });

  it('returns false for a malformed stored hash without throwing', async () => {
    await expect(verifySecret('anything', 'not-a-valid-hash')).resolves.toBe(false);
    await expect(verifySecret('anything', 'scrypt$only-one-part')).resolves.toBe(false);
    await expect(verifySecret('anything', '')).resolves.toBe(false);
  });
});

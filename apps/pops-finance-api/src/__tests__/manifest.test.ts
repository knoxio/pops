import { describe, expect, it } from 'vitest';

import { financeManifest } from '@pops/finance-contract/settings';
import { ManifestPayloadSchema, validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildFinanceManifest, FINANCE_PILLAR_ID } from '../manifest.js';

describe('buildFinanceManifest', () => {
  it('produces a payload that passes the central manifest schema', () => {
    const manifest = buildFinanceManifest('0.1.0');
    const parsed = ManifestPayloadSchema.parse(manifest);
    expect(parsed.pillar).toBe(FINANCE_PILLAR_ID);
    expect(parsed.contract.tag).toBe('contract-finance@v0.1.0');
  });

  it('passes cross-field validation', () => {
    const manifest = buildFinanceManifest('0.1.0');
    const result = validateManifestPayload(manifest);
    expect(result.ok).toBe(true);
  });

  it('declares the finance settings manifest (PRD-240 US-03)', () => {
    const manifest = buildFinanceManifest('0.1.0');
    expect(manifest.settings?.manifests).toHaveLength(1);
    const [descriptor] = manifest.settings?.manifests ?? [];
    expect(descriptor?.id).toBe(financeManifest.id);
    expect(descriptor?.title).toBe(financeManifest.title);
    expect(descriptor?.order).toBe(financeManifest.order);
    expect(descriptor?.groups.length).toBeGreaterThan(0);
  });

  it('serialises round-trip through JSON and re-validates', () => {
    const manifest = buildFinanceManifest('0.1.0');
    const wire = JSON.parse(JSON.stringify(manifest)) as unknown;
    const parsed = ManifestPayloadSchema.parse(wire);
    expect(parsed.settings?.manifests[0]?.id).toBe(financeManifest.id);
  });

  it('rejects non-semver versions at the schema boundary', () => {
    const manifest = buildFinanceManifest('not-a-semver');
    expect(() => ManifestPayloadSchema.parse(manifest)).toThrow();
  });
});

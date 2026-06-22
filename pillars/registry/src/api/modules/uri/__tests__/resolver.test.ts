/**
 * Tests for the URI resolver dispatcher (PRD-101 US-08).
 *
 * Relocated from `apps/pops-api/src/modules/core/uri/resolver.test.ts`. The
 * stub manifests keep the assertions focused on dispatch logic — install
 * gating, type lookup, narrow→wide result translation.
 */
import { describe, expect, it, vi } from 'vitest';

import { resolveUri, type UriRegistryView } from '../resolver.js';

import type { ModuleManifest, UriResolution } from '@pops/types';

function makeManifest(
  id: string,
  types: readonly string[],
  resolve: (type: string, id: string) => Promise<UriResolution>
): ModuleManifest {
  return {
    id,
    name: id,
    surfaces: ['app'],
    uriHandler: { types, resolve },
  };
}

const ALL_INSTALLED = (): boolean => true;

describe('resolveUri', () => {
  it('returns malformed for invalid URIs', async () => {
    const result = await resolveUri('not-a-pops-uri', { registry: [], isInstalled: ALL_INSTALLED });
    expect(result.kind).toBe('malformed');
    if (result.kind === 'malformed') {
      expect(result.uri).toBe('not-a-pops-uri');
      expect(result.reason).toMatch(/pops:/);
    }
  });

  it('returns module-absent when the owning module is not installed', async () => {
    const finance = makeManifest('finance', ['transaction'], async () => ({
      kind: 'object',
      data: { id: 'tx-1' },
    }));
    const isInstalled = vi.fn((moduleId: string) => moduleId !== 'media');

    const result = await resolveUri('pops:media/movie/42', { registry: [finance], isInstalled });
    expect(result).toEqual({ kind: 'module-absent', moduleId: 'media' });
  });

  it('returns not-found when module is installed but no manifest matches', async () => {
    const result = await resolveUri('pops:media/movie/42', {
      registry: [],
      isInstalled: ALL_INSTALLED,
    });
    expect(result).toEqual({ kind: 'not-found', moduleId: 'media', type: 'movie', id: '42' });
  });

  it('returns not-found when module is installed but type is not declared', async () => {
    const finance = makeManifest('finance', ['transaction'], async () => ({
      kind: 'object',
      data: null,
    }));
    const result = await resolveUri('pops:finance/budget/123', {
      registry: [finance],
      isInstalled: ALL_INSTALLED,
    });
    expect(result).toEqual({ kind: 'not-found', moduleId: 'finance', type: 'budget', id: '123' });
  });

  it('dispatches to the manifest resolver and decorates the object result', async () => {
    const payload = { description: 'Coffee', amount: 4.5 };
    const resolve = vi.fn(async () => ({ kind: 'object', data: payload }) satisfies UriResolution);
    const finance = makeManifest('finance', ['transaction'], resolve);

    const result = await resolveUri('pops:finance/transaction/tx-1', {
      registry: [finance],
      isInstalled: ALL_INSTALLED,
    });

    expect(resolve).toHaveBeenCalledWith('transaction', 'tx-1');
    expect(result).toEqual({
      kind: 'object',
      moduleId: 'finance',
      type: 'transaction',
      id: 'tx-1',
      data: payload,
    });
  });

  it('translates a handler not-found into the dispatcher not-found shape', async () => {
    const finance = makeManifest('finance', ['transaction'], async () => ({ kind: 'not-found' }));
    const result = await resolveUri('pops:finance/transaction/missing', {
      registry: [finance],
      isInstalled: ALL_INSTALLED,
    });
    expect(result).toEqual({
      kind: 'not-found',
      moduleId: 'finance',
      type: 'transaction',
      id: 'missing',
    });
  });

  it('treats a handler module-absent as the dispatcher module-absent', async () => {
    const finance = makeManifest('finance', ['transaction'], async () => ({
      kind: 'module-absent',
    }));
    const result = await resolveUri('pops:finance/transaction/tx-1', {
      registry: [finance],
      isInstalled: ALL_INSTALLED,
    });
    expect(result).toEqual({ kind: 'module-absent', moduleId: 'finance' });
  });

  it('does not invoke the handler when the module is absent', async () => {
    const resolve = vi.fn(async () => ({ kind: 'not-found' }) satisfies UriResolution);
    const finance = makeManifest('finance', ['transaction'], resolve);
    const registry: UriRegistryView = [finance];

    const result = await resolveUri('pops:finance/transaction/tx-1', {
      registry,
      isInstalled: () => false,
    });

    expect(resolve).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'module-absent', moduleId: 'finance' });
  });
});

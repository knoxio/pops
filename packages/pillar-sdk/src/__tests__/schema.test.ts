import { describe, expect, it } from 'vitest';

import { ManifestPayloadSchema } from '../manifest-schema/schema.js';
import { validManifest } from './fixtures.js';

describe('ManifestPayloadSchema', () => {
  it('accepts a valid manifest', () => {
    const result = ManifestPayloadSchema.safeParse(validManifest());
    expect(result.success).toBe(true);
  });

  it('defaults routes.subscriptions to an empty array when omitted', () => {
    const manifest = validManifest();
    const { subscriptions: _ignored, ...routes } = manifest.routes;
    const input = { ...manifest, routes };
    const result = ManifestPayloadSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.routes.subscriptions).toEqual([]);
    }
  });

  describe('pillar id', () => {
    it.each([
      ['Finance', 'uppercase rejected'],
      ['finance_a', 'underscore rejected'],
      ['1finance', 'leading digit rejected'],
      ['-finance', 'leading hyphen rejected'],
      ['', 'empty rejected'],
    ])('rejects %s (%s)', (pillar) => {
      const result = ManifestPayloadSchema.safeParse({ ...validManifest(), pillar });
      expect(result.success).toBe(false);
    });

    it.each(['finance', 'app-finance', 'a', 'media-lib'])('accepts %s', (pillar) => {
      const m = validManifest();
      m.pillar = pillar;
      m.contract.package = `@pops/${pillar}-contract`;
      m.contract.tag = `contract-${pillar}@v${m.contract.version}`;
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(true);
    });
  });

  describe('semver', () => {
    it.each(['1', '1.2', '1.2.3.4', 'v1.2.3', '1.2.3-FOO', ''])('rejects %s', (version) => {
      const result = ManifestPayloadSchema.safeParse({ ...validManifest(), version });
      expect(result.success).toBe(false);
    });

    it.each(['1.2.3', '0.0.1', '1.2.3-beta.1', '10.20.30-rc.0'])('accepts %s', (version) => {
      const m = validManifest();
      m.version = version;
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(true);
    });
  });

  describe('procedure path', () => {
    it.each([
      'finance.transactions',
      'finance',
      'Finance.transactions.list',
      'finance.Transactions.list',
      'finance..list',
      'finance.transactions.',
      '.transactions.list',
      'finance.transactions.list.extra',
    ])('rejects %s', (path) => {
      const m = validManifest();
      m.routes.queries = [path];
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(false);
    });

    it.each(['finance.transactions.list', 'a.bC.dE2', 'finance.txns2.listAll'])(
      'accepts %s',
      (path) => {
        const m = validManifest();
        m.routes.queries = [path];
        const result = ManifestPayloadSchema.safeParse(m);
        expect(result.success).toBe(true);
      }
    );
  });

  describe('contract package regex', () => {
    it.each([
      '@pops/finance',
      '@pops/finance-contract-v2',
      '@other/finance-contract',
      'pops/finance-contract',
      '@pops/Finance-contract',
    ])('rejects %s', (pkg) => {
      const m = validManifest();
      m.contract.package = pkg;
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(false);
    });
  });

  describe('contract tag regex', () => {
    it.each([
      'contract-finance',
      'contract-finance@1.2.3',
      'contract-finance@v1.2',
      'finance-contract@v1.2.3',
      'contract-Finance@v1.2.3',
    ])('rejects %s', (tag) => {
      const m = validManifest();
      m.contract.tag = tag;
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(false);
    });
  });

  describe('uri types regex', () => {
    it.each(['finance', 'finance/', '/transaction', 'Finance/transaction', 'finance/Transaction'])(
      'rejects %s',
      (uri) => {
        const m = validManifest();
        m.uri.types = [uri];
        const result = ManifestPayloadSchema.safeParse(m);
        expect(result.success).toBe(false);
      }
    );
  });

  describe('settings keys regex', () => {
    it.each(['Foo', '.foo', 'foo.', '1foo', 'foo..bar'])('rejects %s', (key) => {
      const m = validManifest();
      m.settings.keys = [key];
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(false);
    });

    it.each(['finance', 'finance.defaultCurrency', 'finance.a.b.c'])('accepts %s', (key) => {
      const m = validManifest();
      m.settings.keys = [key];
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(true);
    });
  });

  describe('search adapters regex', () => {
    it.each(['Foo', 'foo-bar', '1foo', ''])('rejects %s', (adapter) => {
      const m = validManifest();
      m.search.adapters = [adapter];
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(false);
    });
  });

  describe('healthcheck path', () => {
    it.each(['healthz', 'http://example.com/healthz', ''])('rejects %s', (path) => {
      const m = validManifest();
      m.healthcheck.path = path;
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(false);
    });
  });

  describe('ai tools', () => {
    it('rejects description shorter than 10 chars', () => {
      const m = validManifest();
      m.ai.tools[0]!.description = 'tooshort';
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(false);
    });

    it('rejects description longer than 500 chars', () => {
      const m = validManifest();
      m.ai.tools[0]!.description = 'a'.repeat(501);
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(false);
    });

    it('accepts description exactly 10 chars', () => {
      const m = validManifest();
      m.ai.tools[0]!.description = 'a'.repeat(10);
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(true);
    });

    it('accepts description exactly 500 chars', () => {
      const m = validManifest();
      m.ai.tools[0]!.description = 'a'.repeat(500);
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(true);
    });

    it('rejects non-camelCase tool name', () => {
      const m = validManifest();
      m.ai.tools[0]!.name = 'create_transaction';
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(false);
    });
  });

  describe('strict mode', () => {
    it('rejects an unknown top-level field', () => {
      const input = { ...validManifest(), extraField: 'nope' };
      const result = ManifestPayloadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects an unknown nested field on routes', () => {
      const m = validManifest();
      const input = { ...m, routes: { ...m.routes, unknownThing: [] } };
      const result = ManifestPayloadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects an unknown nested field on contract', () => {
      const m = validManifest();
      const input = { ...m, contract: { ...m.contract, sneaky: true } };
      const result = ManifestPayloadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects an unknown nested field on healthcheck', () => {
      const m = validManifest();
      const input = { ...m, healthcheck: { ...m.healthcheck, port: 8080 } };
      const result = ManifestPayloadSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('empty arrays', () => {
    it('accepts empty search adapters', () => {
      const m = validManifest();
      m.search.adapters = [];
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(true);
    });

    it('accepts empty ai tools', () => {
      const m = validManifest();
      m.ai.tools = [];
      const result = ManifestPayloadSchema.safeParse(m);
      expect(result.success).toBe(true);
    });
  });
});

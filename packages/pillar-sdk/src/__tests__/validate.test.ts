import { describe, expect, it } from 'vitest';

import {
  checkAiToolAllowedUriTypesAreDeclared,
  checkContractPackageMatchesPillar,
  checkContractTagMatchesVersion,
  checkSearchAdapterProceduresAreDeclared,
  pathToDotted,
  validateManifestPayload,
} from '../manifest-schema/validate.js';
import { validManifest } from './fixtures.js';

describe('validateManifestPayload', () => {
  it('returns ok with payload on valid input', () => {
    const result = validateManifestPayload(validManifest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.pillar).toBe('finance');
    }
  });

  it('rejects null with a top-level invalid_type issue', () => {
    const result = validateManifestPayload(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.field).toBe('');
      expect(result.issues[0]!.got).toBe(null);
    }
  });

  it.each([42, 'a string', true, []])('rejects non-object input %s', (input) => {
    const result = validateManifestPayload(input);
    expect(result.ok).toBe(false);
  });

  it('reports invalid_format issues with field, reason, got', () => {
    const m = validManifest();
    m.routes.queries = ['finance.transactions.list', 'finance.transactions', 'finance.foo.bar'];
    const result = validateManifestPayload(m);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const bad = result.issues.find((i) => i.field === 'routes.queries[1]');
      expect(bad).toBeDefined();
      expect(bad?.got).toBe('finance.transactions');
      expect(bad?.reason).toContain('<pillar>.<router>.<procedure>');
      expect(bad?.schemaPath).toEqual(['routes', 'queries', 1]);
    }
  });

  it('reports description min length with field, reason, got', () => {
    const m = validManifest();
    m.ai.tools[0]!.description = 'short';
    const result = validateManifestPayload(m);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((i) => i.field === 'ai.tools[0].description');
      expect(issue).toBeDefined();
      expect(issue?.got).toBe('short');
    }
  });

  describe('strict mode → unknown field issues', () => {
    it('emits an issue per unknown top-level key', () => {
      const result = validateManifestPayload({ ...validManifest(), foo: 1, bar: 2 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const fields = result.issues.map((i) => i.field).toSorted();
        expect(fields).toEqual(['bar', 'foo']);
        for (const issue of result.issues) {
          expect(issue.reason).toBe('unknown field');
        }
        const foo = result.issues.find((i) => i.field === 'foo');
        expect(foo?.got).toBe(1);
        expect(foo?.schemaPath).toEqual(['foo']);
      }
    });

    it('emits a nested field name on unknown nested key', () => {
      const m = validManifest();
      const input = { ...m, routes: { ...m.routes, unknownThing: 'x' } };
      const result = validateManifestPayload(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const issue = result.issues.find((i) => i.field === 'routes.unknownThing');
        expect(issue).toBeDefined();
        expect(issue?.reason).toBe('unknown field');
        expect(issue?.got).toBe('x');
        expect(issue?.schemaPath).toEqual(['routes', 'unknownThing']);
      }
    });
  });

  describe('cross-field rules', () => {
    it('reports mismatched contract.package', () => {
      const m = validManifest();
      m.contract.package = '@pops/media-contract';
      const result = validateManifestPayload(m);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toHaveLength(1);
        const issue = result.issues[0]!;
        expect(issue.field).toBe('contract.package');
        expect(issue.reason).toContain('expected @pops/finance-contract');
        expect(issue.reason).toContain('got @pops/media-contract');
        expect(issue.got).toBe('@pops/media-contract');
      }
    });

    it('reports mismatched contract.tag', () => {
      const m = validManifest();
      m.contract.tag = 'contract-finance@v9.9.9';
      const result = validateManifestPayload(m);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toHaveLength(1);
        const issue = result.issues[0]!;
        expect(issue.field).toBe('contract.tag');
        expect(issue.reason).toContain('expected contract-finance@v1.2.3');
      }
    });

    it('collects both cross-field violations in one pass (no short-circuit)', () => {
      const m = validManifest();
      m.contract.package = '@pops/media-contract';
      m.contract.tag = 'contract-finance@v9.9.9';
      const result = validateManifestPayload(m);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toHaveLength(2);
        const fields = result.issues.map((i) => i.field).toSorted();
        expect(fields).toEqual(['contract.package', 'contract.tag']);
      }
    });

    it('does not run cross-field rules when Zod parse already failed', () => {
      const m = validManifest();
      m.contract.package = 'totally-bogus';
      m.contract.tag = 'totally-bogus-too';
      const result = validateManifestPayload(m);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        for (const issue of result.issues) {
          expect(issue.reason).not.toContain('expected @pops/');
          expect(issue.reason).not.toContain('expected contract-');
        }
      }
    });
  });

  describe('multi-issue collection', () => {
    it('does not short-circuit on the first Zod error', () => {
      const m = validManifest();
      m.routes.queries = ['bogus', 'also.bogus'];
      m.routes.mutations = ['nope'];
      const result = validateManifestPayload(m);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.length).toBeGreaterThanOrEqual(3);
      }
    });
  });
});

describe('pathToDotted', () => {
  it('returns empty string for empty path', () => {
    expect(pathToDotted([])).toBe('');
  });

  it('joins string segments with dots', () => {
    expect(pathToDotted(['routes', 'queries'])).toBe('routes.queries');
  });

  it('renders numeric segments as [N] without a leading dot', () => {
    expect(pathToDotted(['routes', 'queries', 3])).toBe('routes.queries[3]');
  });

  it('handles consecutive array indices', () => {
    expect(pathToDotted(['matrix', 0, 1])).toBe('matrix[0][1]');
  });

  it('handles a leading numeric segment', () => {
    expect(pathToDotted([0, 'name'])).toBe('[0].name');
  });
});

describe('cross-field checkers (pure)', () => {
  it('checkContractPackageMatchesPillar returns [] on match', () => {
    expect(checkContractPackageMatchesPillar(validManifest())).toEqual([]);
  });

  it('checkContractTagMatchesVersion returns [] on match', () => {
    expect(checkContractTagMatchesVersion(validManifest())).toEqual([]);
  });

  it('checkContractPackageMatchesPillar emits one ValidationIssue on mismatch', () => {
    const m = validManifest();
    m.contract.package = '@pops/media-contract';
    const issues = checkContractPackageMatchesPillar(m);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe('contract.package');
    expect(issues[0]!.schemaPath).toEqual(['contract', 'package']);
  });

  it('checkContractTagMatchesVersion emits one ValidationIssue on mismatch', () => {
    const m = validManifest();
    m.contract.tag = 'contract-finance@v0.0.1';
    const issues = checkContractTagMatchesVersion(m);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe('contract.tag');
    expect(issues[0]!.schemaPath).toEqual(['contract', 'tag']);
  });

  describe('checkAiToolAllowedUriTypesAreDeclared', () => {
    it('returns [] when no tool declares allowedUriTypes', () => {
      expect(checkAiToolAllowedUriTypesAreDeclared(validManifest())).toEqual([]);
    });

    it('returns [] when every allowedUriType is declared in uri.types', () => {
      const m = validManifest();
      m.ai.tools[0]!.allowedUriTypes = ['finance/transaction', 'finance/budget'];
      expect(checkAiToolAllowedUriTypesAreDeclared(m)).toEqual([]);
    });

    it('emits an issue per undeclared URI type', () => {
      const m = validManifest();
      m.ai.tools[0]!.allowedUriTypes = ['finance/transaction', 'finance/unknown'];
      const issues = checkAiToolAllowedUriTypesAreDeclared(m);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.field).toBe('ai.tools[0].allowedUriTypes[1]');
      expect(issues[0]!.got).toBe('finance/unknown');
      expect(issues[0]!.reason).toContain('not declared in uri.types');
      expect(issues[0]!.schemaPath).toEqual(['ai', 'tools', 0, 'allowedUriTypes', 1]);
    });

    it('reports across multiple tools without short-circuiting', () => {
      const m = validManifest();
      m.ai.tools = [
        {
          name: 'first',
          description: 'first tool with bad uri scope',
          parameters: { type: 'object' },
          allowedUriTypes: ['finance/missing-a'],
        },
        {
          name: 'second',
          description: 'second tool with bad uri scope',
          parameters: { type: 'object' },
          allowedUriTypes: ['finance/transaction', 'finance/missing-b'],
        },
      ];
      const issues = checkAiToolAllowedUriTypesAreDeclared(m);
      expect(issues).toHaveLength(2);
      const fields = issues.map((i) => i.field).toSorted();
      expect(fields).toEqual(['ai.tools[0].allowedUriTypes[0]', 'ai.tools[1].allowedUriTypes[1]']);
    });
  });
});

describe('checkSearchAdapterProceduresAreDeclared', () => {
  it('returns [] when every adapter procedurePath is declared', () => {
    expect(checkSearchAdapterProceduresAreDeclared(validManifest())).toEqual([]);
  });

  it('emits an issue when an adapter references an undeclared procedure', () => {
    const m = validManifest();
    m.search.adapters[0]!.procedurePath = 'finance.transactions.missing';
    const issues = checkSearchAdapterProceduresAreDeclared(m);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe('search.adapters[0].procedurePath');
    expect(issues[0]!.got).toBe('finance.transactions.missing');
    expect(issues[0]!.reason).toContain('not declared in routes.queries or routes.mutations');
    expect(issues[0]!.schemaPath).toEqual(['search', 'adapters', 0, 'procedurePath']);
  });

  it('accepts a procedurePath declared in routes.mutations', () => {
    const m = validManifest();
    m.search.adapters[0]!.procedurePath = 'finance.transactions.create';
    expect(checkSearchAdapterProceduresAreDeclared(m)).toEqual([]);
  });

  it('reports across multiple adapters without short-circuiting', () => {
    const m = validManifest();
    m.search.adapters[0]!.procedurePath = 'finance.transactions.missingA';
    m.search.adapters[1]!.procedurePath = 'finance.budgets.missingB';
    const issues = checkSearchAdapterProceduresAreDeclared(m);
    expect(issues).toHaveLength(2);
    const fields = issues.map((i) => i.field).toSorted();
    expect(fields).toEqual([
      'search.adapters[0].procedurePath',
      'search.adapters[1].procedurePath',
    ]);
  });
});

describe('validateManifestPayload — search adapter cross-field rules', () => {
  it('rejects a manifest whose adapter references an undeclared procedure', () => {
    const m = validManifest();
    m.search.adapters[0]!.procedurePath = 'finance.transactions.notDeclared';
    const result = validateManifestPayload(m);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.field).toBe('search.adapters[0].procedurePath');
      expect(result.issues[0]!.got).toBe('finance.transactions.notDeclared');
    }
  });
});

describe('validateManifestPayload — ai tool cross-field rules', () => {
  it('rejects a manifest whose tool references an undeclared URI type', () => {
    const m = validManifest();
    m.ai.tools[0]!.allowedUriTypes = ['finance/not-declared'];
    const result = validateManifestPayload(m);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.field).toBe('ai.tools[0].allowedUriTypes[0]');
      expect(result.issues[0]!.got).toBe('finance/not-declared');
    }
  });

  it('accepts a manifest whose tool references only declared URI types', () => {
    const m = validManifest();
    m.ai.tools[0]!.allowedUriTypes = ['finance/transaction'];
    m.ai.tools[0]!.requiredScopes = ['finance.write'];
    const result = validateManifestPayload(m);
    expect(result.ok).toBe(true);
  });
});

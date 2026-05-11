/**
 * Cross-module AI tool aggregation tests (PRD-101 US-10).
 *
 * Exercises the platform-level aggregator that materialises `tools/list`
 * and `tools/call` from the merged `backend.aiTools` slot of every
 * installed module. Uses `__setInstalledManifestsOverride` to swap in
 * synthetic manifest sets per case.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';

import type { AiToolDescriptor, ModuleManifest } from '@pops/types';

const { __resetInstalledManifestsOverride, __setInstalledManifestsOverride } =
  await import('../../modules/installed-modules.js');

const { dispatchTool, listTools } = await import('../tools/index.js');

function makeTool(name: string): AiToolDescriptor {
  return {
    name,
    description: `tool ${name}`,
    inputSchema: { type: 'object', properties: {} },
    handler: vi.fn(async () => ({
      content: [{ type: 'text' as const, text: `result:${name}` }],
    })),
  };
}

function makeManifest(id: string, tools: AiToolDescriptor[]): ModuleManifest {
  return {
    id,
    name: id,
    surfaces: ['app'],
    backend: { router: {}, aiTools: tools },
  };
}

afterEach(() => {
  __resetInstalledManifestsOverride();
});

describe('listTools() aggregation', () => {
  it("returns the union of every installed module's aiTools", () => {
    const finance = makeManifest('finance', [makeTool('finance.tx.find')]);
    const media = makeManifest('media', [
      makeTool('media.movie.find'),
      makeTool('media.show.find'),
    ]);
    __setInstalledManifestsOverride([finance, media]);

    const names = listTools().map((t) => t.name);
    expect(names).toEqual(['finance.tx.find', 'media.movie.find', 'media.show.find']);
  });

  it('omits tools from modules not in the install set', () => {
    // Only finance is installed — media tools must not appear.
    const finance = makeManifest('finance', [makeTool('finance.tx.find')]);
    __setInstalledManifestsOverride([finance]);

    const names = listTools().map((t) => t.name);
    expect(names).toEqual(['finance.tx.find']);
    expect(names).not.toContain('media.movie.find');
  });

  it('returns an empty list when no installed module declares aiTools', () => {
    __setInstalledManifestsOverride([{ id: 'finance', name: 'Finance', surfaces: ['app'] }]);
    expect(listTools()).toEqual([]);
  });

  it('throws when two modules declare the same tool name (runtime uniqueness check)', () => {
    const finance = makeManifest('finance', [makeTool('shared.do')]);
    const media = makeManifest('media', [makeTool('shared.do')]);
    __setInstalledManifestsOverride([finance, media]);

    expect(() => listTools()).toThrow(/AI tool name 'shared.do'/);
    expect(() => listTools()).toThrow(/'finance'/);
    expect(() => listTools()).toThrow(/'media'/);
  });
});

describe('dispatchTool() aggregation', () => {
  it('invokes the handler from the module that declared the tool', async () => {
    const handler = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'ok' }],
    }));
    const finance: ModuleManifest = {
      id: 'finance',
      name: 'Finance',
      surfaces: ['app'],
      backend: {
        router: {},
        aiTools: [
          {
            name: 'finance.tx.find',
            description: 'find tx',
            inputSchema: { type: 'object' },
            handler,
          },
        ],
      },
    };
    __setInstalledManifestsOverride([finance]);

    const result = await dispatchTool('finance.tx.find', { query: 'pizza' });
    expect(handler).toHaveBeenCalledWith({ query: 'pizza' });
    expect(result?.content[0]?.type).toBe('text');
  });

  it('returns null for tools that no installed module declares', () => {
    __setInstalledManifestsOverride([makeManifest('finance', [makeTool('finance.tx.find')])]);

    expect(dispatchTool('media.movie.find', {})).toBeNull();
  });

  it('re-aggregates on every call so test overrides take effect immediately', () => {
    __setInstalledManifestsOverride([makeManifest('finance', [makeTool('a')])]);
    expect(listTools().map((t) => t.name)).toEqual(['a']);

    __setInstalledManifestsOverride([makeManifest('finance', [makeTool('b')])]);
    expect(listTools().map((t) => t.name)).toEqual(['b']);
  });
});

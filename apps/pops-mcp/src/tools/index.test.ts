import { describe, expect, it, vi } from 'vitest';

import { mockClient } from './test-helpers.js';

vi.mock('../client.js', () => ({ getClient: () => mockClient }));

const { allTools } = await import('./index.js');

describe('allTools', () => {
  it('exports exactly 22 tools', () => {
    expect(allTools).toHaveLength(22);
  });

  it('all tool names are unique', () => {
    const names = allTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all tools have a description, inputSchema, and handler', () => {
    for (const tool of allTools) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema['type']).toBe('object');
      expect(typeof tool.handler).toBe('function');
    }
  });
});

import { describe, expect, it } from 'vitest';

const { allTools } = await import('./index.js');

describe('allTools', () => {
  it('exports exactly 30 tools', () => {
    expect(allTools).toHaveLength(30);
  });

  it('includes all inventory write tools', () => {
    const names = new Set(allTools.map((t) => t.name));
    for (const required of [
      'inventory.locations.create',
      'inventory.locations.update',
      'inventory.locations.delete',
      'inventory.items.create',
      'inventory.items.update',
      'inventory.items.delete',
      'inventory.connections.connect',
      'inventory.connections.disconnect',
    ]) {
      expect(names.has(required), `missing tool: ${required}`).toBe(true);
    }
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

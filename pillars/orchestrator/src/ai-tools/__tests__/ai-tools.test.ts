import { describe, expect, it, vi } from 'vitest';

import { createAiToolsHandler } from '../index.js';

import type { Tool } from '@pops/pillar-sdk';

function tool(overrides: Partial<Tool> & { name: string; pillar: string }): Tool {
  return {
    name: overrides.name,
    description: overrides.description ?? `desc for ${overrides.name}`,
    parameters: overrides.parameters ?? {},
    pillar: overrides.pillar,
    pillarStatus: overrides.pillarStatus ?? 'healthy',
  };
}

describe('createAiToolsHandler', () => {
  it('returns exactly the tools the aggregator projects from the registry', async () => {
    const projected: Tool[] = [
      tool({
        name: 'finance.createTransaction',
        pillar: 'finance',
        parameters: { amount: 'number' },
      }),
      tool({ name: 'inventory.addItem', pillar: 'inventory' }),
    ];
    const buildToolList = vi.fn(async () => projected);

    const handler = createAiToolsHandler({ buildToolList });
    const result = await handler();

    expect(buildToolList).toHaveBeenCalledOnce();
    expect(result).toEqual({ tools: projected });
  });

  it('returns an empty tool list when no pillar declares ai.tools (steady state today)', async () => {
    const buildToolList = vi.fn(async (): Promise<readonly Tool[]> => []);

    const handler = createAiToolsHandler({ buildToolList });
    const result = await handler();

    expect(buildToolList).toHaveBeenCalledOnce();
    expect(result).toEqual({ tools: [] });
  });

  it('degrades to an empty list (never throws) when the registry read fails', async () => {
    const failure = new Error('registry unreachable');
    const buildToolList = vi.fn(async (): Promise<readonly Tool[]> => {
      throw failure;
    });
    const onWarn = vi.fn();

    const handler = createAiToolsHandler({ buildToolList, onWarn });
    const result = await handler();

    expect(result).toEqual({ tools: [] });
    expect(onWarn).toHaveBeenCalledOnce();
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('empty tool list'), failure);
  });
});

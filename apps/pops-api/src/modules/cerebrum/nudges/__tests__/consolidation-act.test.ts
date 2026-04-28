/**
 * Tests for consolidation act handler (#2241).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConcatenationSynthesizer, executeConsolidationAct } from '../consolidation-act.js';

import type { BodySynthesizer } from '../consolidation-act.js';
import type { Nudge } from '../types.js';

vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeNudge(overrides: Partial<Nudge> = {}): Nudge {
  return {
    id: 'nudge_test',
    type: 'consolidation',
    title: 'Consolidate: Test',
    body: 'Test body',
    engramIds: ['eng_1', 'eng_2', 'eng_3'],
    priority: 'medium',
    status: 'acted',
    createdAt: '2026-04-27T10:00:00Z',
    expiresAt: null,
    actedAt: '2026-04-27T10:05:00Z',
    action: { type: 'consolidate', label: 'Merge', params: {} },
    ...overrides,
  };
}

function makeEngramEntry(id: string, title: string, scopes: string[], tags: string[]) {
  return {
    engram: {
      id,
      type: 'note',
      title,
      scopes,
      tags,
      links: [],
      created: '2026-01-01T00:00:00Z',
      modified: '2026-01-01T00:00:00Z',
      source: 'manual' as const,
      status: 'active' as const,
      template: null,
      filePath: `${id}.md`,
      contentHash: 'h',
      wordCount: 80,
      customFields: {},
    },
    body: `Content of ${title}.`,
  };
}

function mockEngramService() {
  const engrams = new Map([
    ['eng_1', makeEngramEntry('eng_1', 'First Note', ['work.projects'], ['topic:a'])],
    ['eng_2', makeEngramEntry('eng_2', 'Second Note', ['work.projects'], ['topic:b'])],
    ['eng_3', makeEngramEntry('eng_3', 'Third Note', ['personal.notes'], ['topic:a', 'topic:c'])],
  ]);
  return {
    read: vi.fn((id: string) => {
      const entry = engrams.get(id);
      if (!entry) throw new Error(`Not found: ${id}`);
      return entry;
    }),
    create: vi.fn().mockReturnValue({ id: 'eng_merged_001' }),
    update: vi.fn(),
  };
}

describe('executeConsolidationAct', () => {
  let svc: ReturnType<typeof mockEngramService>;
  let synth: BodySynthesizer;

  beforeEach(() => {
    svc = mockEngramService();
    synth = { synthesize: vi.fn().mockResolvedValue('Synthesized merged content.') };
  });

  it('reads all source engrams and synthesizes merged body', async () => {
    const result = await executeConsolidationAct(makeNudge(), svc as never, synth);
    expect(svc.read).toHaveBeenCalledTimes(3);
    expect(synth.synthesize).toHaveBeenCalledWith(
      ['Content of First Note.', 'Content of Second Note.', 'Content of Third Note.'],
      ['First Note', 'Second Note', 'Third Note']
    );
    expect(result.mergedEngramId).toBe('eng_merged_001');
  });

  it('creates merged engram with combined tags and scopes', async () => {
    await executeConsolidationAct(makeNudge(), svc as never, synth);
    expect(svc.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Consolidated: First Note',
        body: 'Synthesized merged content.',
        type: 'note',
        source: 'agent',
        scopes: expect.arrayContaining(['work.projects', 'personal.notes']),
        tags: expect.arrayContaining(['topic:a', 'topic:b', 'topic:c']),
      })
    );
  });

  it('archives source engrams after merge', async () => {
    const result = await executeConsolidationAct(makeNudge(), svc as never, synth);
    expect(svc.update).toHaveBeenCalledTimes(3);
    expect(svc.update).toHaveBeenCalledWith('eng_1', { status: 'consolidated' });
    expect(svc.update).toHaveBeenCalledWith('eng_2', { status: 'consolidated' });
    expect(result.archivedIds).toEqual(['eng_1', 'eng_2', 'eng_3']);
  });

  it('falls back to concatenation when synthesizer fails', async () => {
    const failing: BodySynthesizer = {
      synthesize: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    };
    await executeConsolidationAct(makeNudge(), svc as never, failing);
    expect(svc.create).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('## First Note'),
      })
    );
  });

  it('throws if nudge has no engram IDs', async () => {
    await expect(
      executeConsolidationAct(makeNudge({ engramIds: [] }), svc as never, synth)
    ).rejects.toThrow('no source engram IDs');
  });

  it('handles partial archive failure gracefully', async () => {
    svc.update.mockImplementation((id: string) => {
      if (id === 'eng_2') throw new Error('File locked');
    });
    const result = await executeConsolidationAct(makeNudge(), svc as never, synth);
    expect(result.archivedIds).toEqual(['eng_1', 'eng_3']);
    expect(result.mergedEngramId).toBe('eng_merged_001');
  });
});

describe('ConcatenationSynthesizer', () => {
  it('produces sections with headings separated by dividers', async () => {
    const synth = new ConcatenationSynthesizer();
    const result = await synth.synthesize(['Body A', 'Body B'], ['Title A', 'Title B']);
    expect(result).toContain('## Title A');
    expect(result).toContain('## Title B');
    expect(result).toContain('---');
  });
});

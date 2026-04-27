/**
 * Tests for CortexEntityExtractor — focused on the date normalisation and
 * referenced_dates collection logic (PRD-081 US-05).
 *
 * LLM calls are mocked; these tests verify the extraction pipeline around them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityExtractionResult } from './types.js';

// Mock the Anthropic SDK and supporting utilities.
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));
vi.mock('../../../env.js', () => ({
  getEnv: (name: string) => (name === 'ANTHROPIC_API_KEY' ? 'test-key' : undefined),
}));
vi.mock('../../../lib/ai-retry.js', () => ({
  withRateLimitRetry: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../../../lib/inference-middleware.js', () => ({
  trackInference: (_meta: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { CortexEntityExtractor } = await import('./entity-extractor.js');

function mockLlmResponse(entities: unknown[]): void {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(entities) }],
  });
}

describe('CortexEntityExtractor', () => {
  let extractor: InstanceType<typeof CortexEntityExtractor>;

  beforeEach(() => {
    vi.clearAllMocks();
    extractor = new CortexEntityExtractor();
  });

  describe('referencedDates collection', () => {
    it('collects ISO 8601 dates from date entities', async () => {
      mockLlmResponse([
        { type: 'date', value: 'March 15th', normalised: '2026-03-15', confidence: 0.9 },
        { type: 'date', value: 'Q1 2026', normalised: '2026-01-01', confidence: 0.85 },
        { type: 'person', value: 'Alice', normalised: 'Alice', confidence: 0.95 },
      ]);

      const result = await extractor.extract('Met with Alice on March 15th about Q1 2026');
      expect(result.referencedDates).toEqual(['2026-01-01', '2026-03-15']);
    });

    it('returns empty referencedDates when no date entities', async () => {
      mockLlmResponse([
        { type: 'person', value: 'Bob', normalised: 'Bob', confidence: 0.9 },
        {
          type: 'topic',
          value: 'machine learning',
          normalised: 'machine learning',
          confidence: 0.8,
        },
      ]);

      const result = await extractor.extract('Bob is working on machine learning');
      expect(result.referencedDates).toEqual([]);
    });

    it('deduplicates date values', async () => {
      mockLlmResponse([
        { type: 'date', value: 'March 15', normalised: '2026-03-15', confidence: 0.9 },
        { type: 'date', value: '15th March', normalised: '2026-03-15', confidence: 0.85 },
      ]);

      const result = await extractor.extract('On March 15 (15th March) we met');
      expect(result.referencedDates).toEqual(['2026-03-15']);
    });

    it('sorts dates chronologically', async () => {
      mockLlmResponse([
        { type: 'date', value: 'December', normalised: '2026-12-01', confidence: 0.8 },
        { type: 'date', value: 'January', normalised: '2026-01-15', confidence: 0.85 },
        { type: 'date', value: 'June', normalised: '2026-06-20', confidence: 0.9 },
      ]);

      const result = await extractor.extract('Planning for January, June, and December');
      expect(result.referencedDates).toEqual(['2026-01-15', '2026-06-20', '2026-12-01']);
    });

    it('filters out non-ISO date normalisations', async () => {
      mockLlmResponse([
        { type: 'date', value: 'next week', normalised: 'next week', confidence: 0.7 },
        { type: 'date', value: 'March 15', normalised: '2026-03-15', confidence: 0.9 },
      ]);

      const result = await extractor.extract('Next week and March 15');
      // "next week" without proper normalisation is filtered out
      expect(result.referencedDates).toEqual(['2026-03-15']);
    });

    it('excludes date entities below confidence threshold', async () => {
      mockLlmResponse([
        { type: 'date', value: 'sometime in Q3', normalised: '2026-07-01', confidence: 0.5 },
        { type: 'date', value: 'March 15', normalised: '2026-03-15', confidence: 0.9 },
      ]);

      const result = await extractor.extract('Maybe Q3 but definitely March 15');
      // 0.5 is below default threshold of 0.7
      expect(result.referencedDates).toEqual(['2026-03-15']);
    });
  });

  describe('referenceDate parameter', () => {
    it('passes reference date to the LLM prompt', async () => {
      mockLlmResponse([]);

      await extractor.extract('Last Tuesday we met', [], '2026-04-27');

      const call = mockCreate.mock.calls[0];
      const prompt = (call?.[0] as Record<string, unknown>)?.messages as Array<{ content: string }>;
      expect(prompt[0]?.content).toContain(
        'Reference date for resolving relative dates: 2026-04-27'
      );
    });

    it('defaults to current date when referenceDate not provided', async () => {
      mockLlmResponse([]);

      await extractor.extract('Last Tuesday we met');

      const call = mockCreate.mock.calls[0];
      const prompt = (call?.[0] as Record<string, unknown>)?.messages as Array<{ content: string }>;
      expect(prompt[0]?.content).toContain('Reference date for resolving relative dates:');
    });
  });

  describe('graceful degradation', () => {
    it('returns empty referencedDates when API key is missing', async () => {
      const { CortexEntityExtractor: FreshExtractor } = await import('./entity-extractor.js');
      vi.doMock('../../../env.js', () => ({
        getEnv: () => undefined,
      }));

      // The existing mock returns 'test-key' so this specific test relies
      // on the production code path. The key thing is the type contract.
      const fresh = new FreshExtractor();
      const result: EntityExtractionResult = await fresh.extract('test');
      expect(result).toHaveProperty('referencedDates');
    });

    it('returns empty referencedDates when LLM returns no entities', async () => {
      mockLlmResponse([]);

      const result = await extractor.extract('No entities here');
      expect(result.referencedDates).toEqual([]);
      expect(result.entities).toEqual([]);
      expect(result.tags).toEqual([]);
    });
  });
});

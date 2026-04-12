import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
const sharedMockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return { messages: { create: sharedMockCreate } };
  }),
}));

vi.mock('../../../../env.js', () => ({
  getEnv: vi.fn((key: string) => (key === 'CLAUDE_API_KEY' ? 'test-key' : undefined)),
}));

vi.mock('../../../../db.js', () => ({
  getDrizzle: () => ({
    insert: () => ({
      values: () => ({
        run: vi.fn(),
      }),
    }),
  }),
}));

vi.mock('@pops/db-types', () => ({
  aiUsage: {},
  transactions: { tags: 'tags' },
}));

vi.mock('../../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import type { CorrectionAnalysis } from './rule-generator.js';
import { analyzeCorrection, patternMatchesDescription } from './rule-generator.js';

const mockCreate = sharedMockCreate;

function makeAiResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analyzeCorrection', () => {
  it('returns AI-suggested pattern when entity name is present in description', async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"contains","pattern":"WOOLWORTHS","confidence":0.9}')
    );

    const result = await analyzeCorrection({
      description: 'WOOLWORTHS 1234 SYDNEY',
      entityName: 'Woolworths',
      amount: -42.5,
    });

    expect(result).toEqual({
      matchType: 'contains',
      pattern: 'WOOLWORTHS',
      confidence: 0.9,
    } satisfies CorrectionAnalysis);
  });

  it('handles contains matchType when entity appears after prefix', async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"contains","pattern":"NETFLIX","confidence":0.85}')
    );

    const result = await analyzeCorrection({
      description: 'PAYMENT TO NETFLIX',
      entityName: 'Netflix',
      amount: -15.99,
    });

    expect(result).toEqual({
      matchType: 'contains',
      pattern: 'NETFLIX',
      confidence: 0.85,
    });
  });

  it('rejects AI response when proposed pattern does not match the description', async () => {
    // Reproduces the bug: entity name "American Express" has zero textual
    // overlap with description "MEMBERSHIP FEE", AI hallucinates and echoes
    // the entity name back as the pattern. The validator must reject it so
    // the frontend fallback takes over.
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"contains","pattern":"AMERICAN EXPRESS","confidence":0.8}')
    );

    const result = await analyzeCorrection({
      description: 'MEMBERSHIP FEE',
      entityName: 'American Express',
      amount: -450,
    });

    expect(result).toBeNull();
  });

  it('accepts the full description as the pattern when no shorter identifier exists', async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"exact","pattern":"MEMBERSHIP FEE","confidence":0.7}')
    );

    const result = await analyzeCorrection({
      description: 'MEMBERSHIP FEE',
      entityName: 'American Express',
      amount: -450,
    });

    expect(result).toEqual({
      matchType: 'exact',
      pattern: 'MEMBERSHIP FEE',
      confidence: 0.7,
    });
  });

  it('accepts a regex matchType that matches the description', async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"regex","pattern":"WOOLWORTHS.*","confidence":0.8}')
    );

    const result = await analyzeCorrection({
      description: 'WOOLWORTHS 1234 SYDNEY',
      entityName: 'Woolworths',
      amount: -42.5,
    });

    expect(result).toEqual({
      matchType: 'regex',
      pattern: 'WOOLWORTHS.*',
      confidence: 0.8,
    });
  });

  it('rejects a regex matchType that does not match the description', async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"regex","pattern":"^NETFLIX$","confidence":0.8}')
    );

    const result = await analyzeCorrection({
      description: 'WOOLWORTHS 1234',
      entityName: 'Woolworths',
      amount: -42.5,
    });

    expect(result).toBeNull();
  });

  it('returns null when API key is not configured', async () => {
    const { getEnv } = await import('../../../../env.js');
    (getEnv as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);

    const result = await analyzeCorrection({
      description: 'TEST',
      entityName: 'Test',
      amount: -10,
    });

    expect(result).toBeNull();
  });

  it('returns null when AI call throws', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));

    const result = await analyzeCorrection({
      description: 'WOOLWORTHS 1234',
      entityName: 'Woolworths',
      amount: -42.5,
    });

    expect(result).toBeNull();
  });

  it('returns null when AI returns empty content', async () => {
    mockCreate.mockResolvedValue({
      content: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const result = await analyzeCorrection({
      description: 'WOOLWORTHS 1234',
      entityName: 'Woolworths',
      amount: -42.5,
    });

    expect(result).toBeNull();
  });

  it('returns null when pattern is too short (< 3 chars)', async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"contains","pattern":"AB","confidence":0.8}')
    );

    const result = await analyzeCorrection({
      description: 'AB CORP',
      entityName: 'AB',
      amount: -10,
    });

    expect(result).toBeNull();
  });

  it("returns null for invalid matchType (e.g. legacy 'prefix')", async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"prefix","pattern":"WOOLWORTHS","confidence":0.7}')
    );

    const result = await analyzeCorrection({
      description: 'WOOLWORTHS 1234',
      entityName: 'Woolworths',
      amount: -42.5,
    });

    // "prefix" is no longer in the supported union (schema is exact/contains/regex).
    expect(result).toBeNull();
  });

  it('returns null for confidence out of range', async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"contains","pattern":"WOOLWORTHS","confidence":1.5}')
    );

    const result = await analyzeCorrection({
      description: 'WOOLWORTHS 1234',
      entityName: 'Woolworths',
      amount: -42.5,
    });

    expect(result).toBeNull();
  });

  it('strips markdown code fences from response', async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse(
        '```json\n{"matchType":"contains","pattern":"WOOLWORTHS","confidence":0.9}\n```'
      )
    );

    const result = await analyzeCorrection({
      description: 'WOOLWORTHS 1234',
      entityName: 'Woolworths',
      amount: -42.5,
    });

    expect(result).toEqual({
      matchType: 'contains',
      pattern: 'WOOLWORTHS',
      confidence: 0.9,
    });
  });

  it('does not send account information to the AI', async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"contains","pattern":"WOOLWORTHS","confidence":0.9}')
    );

    await analyzeCorrection({
      description: 'WOOLWORTHS 1234 SYDNEY',
      entityName: 'Woolworths',
      amount: -42.5,
    });

    // Verify the prompt does not contain "account" or any account identifier
    const promptArg = mockCreate.mock.calls[0]?.[0];
    const promptContent = promptArg?.messages?.[0]?.content as string;
    expect(promptContent).not.toContain('Account:');
    expect(promptContent).not.toContain('account:');
  });
});

describe('patternMatchesDescription', () => {
  it('matches contains when pattern is a normalized substring', () => {
    expect(patternMatchesDescription('WOOLWORTHS', 'contains', 'WOOLWORTHS 1234 SYDNEY')).toBe(
      true
    );
  });

  it('normalizes case and digits before comparing', () => {
    expect(patternMatchesDescription('woolworths', 'contains', 'Woolworths 1234')).toBe(true);
  });

  it('does not match when pattern is absent from description', () => {
    expect(patternMatchesDescription('AMERICAN EXPRESS', 'contains', 'MEMBERSHIP FEE')).toBe(false);
  });

  it('matches exact when normalized pattern equals normalized description', () => {
    expect(patternMatchesDescription('MEMBERSHIP FEE', 'exact', 'Membership Fee')).toBe(true);
  });

  it('rejects exact when description has additional tokens', () => {
    expect(patternMatchesDescription('MEMBERSHIP', 'exact', 'MEMBERSHIP FEE')).toBe(false);
  });

  it('matches regex patterns against the normalized description', () => {
    expect(patternMatchesDescription('WOOLWORTHS.*', 'regex', 'WOOLWORTHS 1234 SYDNEY')).toBe(true);
  });

  it('returns false for invalid regex patterns', () => {
    expect(patternMatchesDescription('[unclosed', 'regex', 'ANYTHING')).toBe(false);
  });
});

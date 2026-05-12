/**
 * Tests for the LLM-backed contradiction analyzer (PRD-084 US-03, #2580).
 *
 * The analyzer is the load-bearing piece for AC #4 and #6: it must return
 * structured evidence (conflict summary + per-side excerpt) for genuine
 * conflicts and a clean null for everything else — including malformed
 * model output, since a parse failure means we have nothing trustworthy to
 * surface to the user.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pops/db-types', () => ({
  settings: { key: { name: 'key' }, value: { name: 'value' } },
}));

vi.mock('../../../../env.js', () => ({
  getEnv: vi.fn().mockReturnValue('test-api-key'),
}));

vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../lib/ai-retry.js', () => ({
  withRateLimitRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../../../lib/inference-middleware.js', () => ({
  trackInference: vi.fn((_opts: unknown, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../../core/settings/service.js', () => ({
  getSettingValue: vi.fn((_key: string, fallback: unknown) => fallback),
  getAiModel: vi.fn((_key: string, fallback: string) => fallback),
}));

const mockCreate = vi.fn();

class MockAnthropic {
  messages = { create: mockCreate };
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: MockAnthropic,
}));

const { LlmContradictionAnalyzer, NoopContradictionAnalyzer, parseAnalyzerResponse } =
  await import('../detectors/contradiction-analyzer.js');

describe('parseAnalyzerResponse', () => {
  it('returns null when the model says no contradiction', () => {
    const out = parseAnalyzerResponse('{"contradiction": false}');
    expect(out).toBeNull();
  });

  it('parses a well-formed contradiction payload', () => {
    const raw = JSON.stringify({
      contradiction: true,
      conflict: 'A says X, B says not X.',
      excerptA: 'I think X is correct.',
      excerptB: 'X is definitely wrong.',
    });
    const out = parseAnalyzerResponse(raw);
    expect(out).toEqual({
      conflict: 'A says X, B says not X.',
      excerptA: 'I think X is correct.',
      excerptB: 'X is definitely wrong.',
    });
  });

  it('returns null when contradiction=true but fields are missing', () => {
    const raw = JSON.stringify({ contradiction: true, conflict: 'oops' });
    expect(parseAnalyzerResponse(raw)).toBeNull();
  });

  it('returns null for empty strings even when contradiction=true', () => {
    const raw = JSON.stringify({
      contradiction: true,
      conflict: '',
      excerptA: 'a',
      excerptB: 'b',
    });
    expect(parseAnalyzerResponse(raw)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseAnalyzerResponse('not json')).toBeNull();
    expect(parseAnalyzerResponse('{ broken json ')).toBeNull();
    expect(parseAnalyzerResponse('')).toBeNull();
  });

  it('tolerates surrounding prose around the JSON', () => {
    const raw = `Sure, here you go:\n{"contradiction": true, "conflict": "C", "excerptA": "a", "excerptB": "b"}\nThat's all.`;
    const out = parseAnalyzerResponse(raw);
    expect(out?.conflict).toBe('C');
  });

  it('hard-cuts excerpts longer than 240 chars without appending ellipsis', () => {
    // Excerpts are presented as verbatim quotes — appending any character
    // (ellipsis, marker, etc.) would mutate the quoted source text.
    const long = 'x'.repeat(300);
    const raw = JSON.stringify({
      contradiction: true,
      conflict: 'long',
      excerptA: long,
      excerptB: 'short',
    });
    const out = parseAnalyzerResponse(raw);
    expect(out?.excerptA.length).toBe(240);
    // No ellipsis, no sentinel — the cut is clean.
    expect(out?.excerptA.endsWith('…')).toBe(false);
    expect(out?.excerptA).toBe('x'.repeat(240));
  });

  it('returns null when contradiction field has wrong type (zod boundary)', () => {
    // `contradiction` is required to be boolean — a string here is a
    // schema violation and must collapse to the safe "no contradiction"
    // default.
    const raw = JSON.stringify({
      contradiction: 'yes',
      conflict: 'C',
      excerptA: 'a',
      excerptB: 'b',
    });
    expect(parseAnalyzerResponse(raw)).toBeNull();
  });

  it('returns null when excerpt fields are not strings', () => {
    const raw = JSON.stringify({
      contradiction: true,
      conflict: 'C',
      excerptA: 123,
      excerptB: 'b',
    });
    expect(parseAnalyzerResponse(raw)).toBeNull();
  });

  it('returns null when conflict is not a string', () => {
    const raw = JSON.stringify({
      contradiction: true,
      conflict: { nested: 'oops' },
      excerptA: 'a',
      excerptB: 'b',
    });
    expect(parseAnalyzerResponse(raw)).toBeNull();
  });
});

describe('LlmContradictionAnalyzer.analyze', () => {
  let analyzer: InstanceType<typeof LlmContradictionAnalyzer>;

  beforeEach(() => {
    vi.clearAllMocks();
    analyzer = new LlmContradictionAnalyzer();
  });

  it('returns evidence with both engram IDs threaded through', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            contradiction: true,
            conflict: 'A says deploy Friday, B forbids it.',
            excerptA: 'Friday deploys are fine.',
            excerptB: 'Never deploy on Fridays.',
          }),
        },
      ],
    });

    const out = await analyzer.analyze(
      'eng_a',
      'Friday deploys are fine.',
      'eng_b',
      'Never deploy on Fridays.'
    );

    expect(out).toEqual({
      engramA: 'eng_a',
      engramB: 'eng_b',
      conflict: 'A says deploy Friday, B forbids it.',
      excerptA: 'Friday deploys are fine.',
      excerptB: 'Never deploy on Fridays.',
    });
  });

  it('returns null when the model reports no contradiction', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"contradiction": false}' }],
    });

    const out = await analyzer.analyze('a', 'x', 'b', 'y');
    expect(out).toBeNull();
  });

  it('skips inference when the API key is missing', async () => {
    const { getEnv } = await import('../../../../env.js');
    vi.mocked(getEnv).mockReturnValueOnce(undefined);

    const out = await analyzer.analyze('a', 'x', 'b', 'y');
    expect(out).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns null when the model returns garbage', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'literally garbage output' }],
    });

    const out = await analyzer.analyze('a', 'x', 'b', 'y');
    expect(out).toBeNull();
  });
});

describe('NoopContradictionAnalyzer', () => {
  it('always returns null', async () => {
    const analyzer = new NoopContradictionAnalyzer();
    expect(await analyzer.analyze('a', 'x', 'b', 'y')).toBeNull();
  });
});

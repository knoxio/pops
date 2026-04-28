/**
 * Tests for LlmContradictionDetector (#2243).
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

vi.mock('../../core/settings/service.js', () => ({
  getSettingValue: vi.fn((_key: string, fallback: unknown) => fallback),
}));

const mockCreate = vi.fn();

class MockAnthropic {
  messages = { create: mockCreate };
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: MockAnthropic,
}));

const { LlmContradictionDetector } = await import('../llm-contradiction-detector.js');

describe('LlmContradictionDetector', () => {
  let detector: InstanceType<typeof LlmContradictionDetector>;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new LlmContradictionDetector();
  });

  it('returns null when LLM responds NO_CONTRADICTION', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'NO_CONTRADICTION' }],
    });

    const result = await detector.detectContradiction(
      'Deploy on Fridays is fine.',
      'We should deploy more often.'
    );

    expect(result).toBeNull();
  });

  it('returns conflict summary when LLM detects contradiction', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'Passage A says Friday deploys are fine, Passage B forbids them.' },
      ],
    });

    const result = await detector.detectContradiction(
      'Deploy on Fridays is fine.',
      'Never deploy on Fridays.'
    );

    expect(result).toBe('Passage A says Friday deploys are fine, Passage B forbids them.');
  });

  it('returns null for empty LLM response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '' }],
    });

    const result = await detector.detectContradiction('A', 'B');
    expect(result).toBeNull();
  });

  it('sends truncated bodies to the LLM', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'NO_CONTRADICTION' }],
    });

    const longBody = 'x'.repeat(3000);
    await detector.detectContradiction(longBody, 'short');

    const callArgs = mockCreate.mock.calls[0]![0] as { messages: Array<{ content: string }> };
    const userContent = callArgs.messages[0]!.content;
    // Should truncate to 2000 + '...'
    expect(userContent).toContain('...');
    expect(userContent.length).toBeLessThan(5000);
  });

  it('skips when API key is missing', async () => {
    const { getEnv } = await import('../../../../env.js');
    vi.mocked(getEnv).mockReturnValueOnce(undefined);

    const result = await detector.detectContradiction('A', 'B');
    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

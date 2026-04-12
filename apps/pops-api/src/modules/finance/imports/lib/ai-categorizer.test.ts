import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiCategorizationError, categorizeWithAi, clearCache } from './ai-categorizer.js';

/**
 * Unit tests for AI categorization with mocked Anthropic API.
 * ALL tests are 100% offline - zero actual API calls to avoid costs.
 */

// Mock the Anthropic SDK
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        messages: {
          create: mockCreate,
        },
      };
    }),
  };
});

// Mock the database
const mockDbRun = vi.fn();
vi.mock('../../../../db.js', () => {
  return {
    getDrizzle: vi.fn(() => ({
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          run: mockDbRun,
        })),
      })),
    })),
    // Always return false: tests exercise the real API path, not the named-env skip
    isNamedEnvContext: vi.fn().mockReturnValue(false),
  };
});

// Mock node:fs so disk I/O doesn't interfere with unit tests
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Store original env var
const originalEnv = process.env['CLAUDE_API_KEY'];

beforeEach(() => {
  // Clear cache before each test to prevent pollution
  clearCache();
  // Clear mock calls
  mockCreate.mockClear();
  mockDbRun.mockClear();
  // Set API key by default for tests
  process.env['CLAUDE_API_KEY'] = 'test-api-key-12345';
});

afterEach(() => {
  // Restore original env var
  if (originalEnv === undefined) {
    delete process.env['CLAUDE_API_KEY'];
  } else {
    process.env['CLAUDE_API_KEY'] = originalEnv;
  }
});

describe('categorizeWithAi', () => {
  describe('Caching behavior', () => {
    it('calls mocked API for new rawRow', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Woolworths", "category": "Groceries"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result, usage } = await categorizeWithAi('WOOLWORTHS 1234');

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(result).not.toBeNull();
      expect(result?.entityName).toBe('Woolworths');
      expect(result?.category).toBe('Groceries');
      expect(result?.cachedAt).toBeDefined();
      expect(usage).toBeDefined();
      expect(usage?.inputTokens).toBe(50);
      expect(usage?.outputTokens).toBe(20);
      expect(usage?.costUsd).toBeCloseTo(0.00015); // (50/1M * $1) + (20/1M * $5)
    });

    it('returns cached result without calling API on second call', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Coles", "category": "Groceries"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      // First call
      const { result: result1, usage: usage1 } = await categorizeWithAi('COLES 5678');
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(usage1).toBeDefined();

      // Second call with same rawRow
      const { result: result2, usage: usage2 } = await categorizeWithAi('COLES 5678');
      expect(mockCreate).toHaveBeenCalledTimes(1); // Still only 1 call
      expect(result2?.entityName).toBe('Coles');
      expect(result2?.cachedAt).toBe(result1?.cachedAt); // Same cached result
      expect(usage2).toBeUndefined(); // No usage stats for cache hit
    });

    it('caches are case-insensitive and trimmed', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Netflix", "category": "Subscriptions"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      // First call
      await categorizeWithAi('  netflix.com  ');
      expect(mockCreate).toHaveBeenCalledTimes(1);

      // Second call with different case/whitespace
      const { result: result2, usage: usage2 } = await categorizeWithAi('NETFLIX.COM');
      expect(mockCreate).toHaveBeenCalledTimes(1); // Cache hit

      expect(result2?.entityName).toBe('Netflix');
      expect(usage2).toBeUndefined(); // No usage stats for cache hit
    });

    it('calls API for different rawRow', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"entityName": "Woolworths", "category": "Groceries"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      await categorizeWithAi('WOOLWORTHS 1234');
      expect(mockCreate).toHaveBeenCalledTimes(1);

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"entityName": "Coles", "category": "Groceries"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      await categorizeWithAi('COLES 5678');
      expect(mockCreate).toHaveBeenCalledTimes(2); // Different description = new call
    });

    it('sets cachedAt timestamp', async () => {
      const before = new Date().toISOString();
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Test", "category": "Other"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result } = await categorizeWithAi('TEST MERCHANT');
      const after = new Date().toISOString();

      expect(result?.cachedAt).toBeDefined();
      const cachedAt = result?.cachedAt;
      if (!cachedAt) throw new Error('Expected cachedAt to be defined');
      expect(cachedAt >= before).toBe(true);
      expect(cachedAt <= after).toBe(true);
    });
  });

  describe('API key handling', () => {
    it('throws AiCategorizationError when CLAUDE_API_KEY is missing', async () => {
      delete process.env['CLAUDE_API_KEY'];

      await expect(categorizeWithAi('WOOLWORTHS 1234')).rejects.toThrow(AiCategorizationError);
      await expect(categorizeWithAi('WOOLWORTHS 1234')).rejects.toThrow(
        'CLAUDE_API_KEY not configured'
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('throws AiCategorizationError when CLAUDE_API_KEY is empty string', async () => {
      process.env['CLAUDE_API_KEY'] = '';

      await expect(categorizeWithAi('WOOLWORTHS 1234')).rejects.toThrow(AiCategorizationError);
      await expect(categorizeWithAi('WOOLWORTHS 1234')).rejects.toThrow(
        'CLAUDE_API_KEY not configured'
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('uses provided API key to create client', async () => {
      process.env['CLAUDE_API_KEY'] = 'my-secret-key';

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Test", "category": "Other"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      await categorizeWithAi('TEST');

      // Can't easily verify apiKey without exposing it from constructor
      // But we verified it creates client and calls API
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe('API response handling', () => {
    it('parses JSON response correctly', async () => {
      mockCreate.mockResolvedValue({
        content: [
          { type: 'text', text: '{"entityName": "Roastville Cafe", "category": "Dining"}' },
        ],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result } = await categorizeWithAi('ROASTVILLE CAFE');

      expect(result?.entityName).toBe('Roastville Cafe');
      expect(result?.category).toBe('Dining');
      expect(result?.description).toBe('ROASTVILLE CAFE');
    });

    it('returns null when API returns non-text content', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'image', data: '...' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result } = await categorizeWithAi('TEST');

      expect(result).toBeNull();
    });

    it('returns null when API returns empty content array', async () => {
      mockCreate.mockResolvedValue({
        content: [],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result } = await categorizeWithAi('TEST');

      expect(result).toBeNull();
    });

    it('throws AiCategorizationError when API returns invalid JSON', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'This is not JSON' }],
      });

      await expect(categorizeWithAi('TEST')).rejects.toThrow(AiCategorizationError);
    });

    it('handles JSON with partial data (missing entityName)', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"category": "Groceries"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result } = await categorizeWithAi('TEST');

      // Code doesn't validate schema, so it creates entry with undefined fields
      expect(result?.entityName).toBeUndefined();
      expect(result?.category).toBe('Groceries');
    });

    it('handles JSON with partial data (missing category)', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Woolworths"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result } = await categorizeWithAi('TEST');

      expect(result?.entityName).toBe('Woolworths');
      expect(result?.category).toBeUndefined();
    });

    it('handles special characters in response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "McDonald\'s", "category": "Dining"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result } = await categorizeWithAi('MCDONALDS');

      expect(result?.entityName).toBe("McDonald's");
    });

    it('trims rawRow in description field', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Test", "category": "Other"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result } = await categorizeWithAi('  TEST MERCHANT  ');

      expect(result?.description).toBe('TEST MERCHANT'); // Trimmed
    });
  });

  describe('Error handling', () => {
    it('throws AiCategorizationError when API throws error', async () => {
      mockCreate.mockRejectedValue(new Error('API timeout'));

      await expect(categorizeWithAi('TEST')).rejects.toThrow(AiCategorizationError);
      await expect(categorizeWithAi('TEST')).rejects.toThrow('Failed to categorize: API timeout');
    });

    it('throws AiCategorizationError when API throws network error', async () => {
      mockCreate.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(categorizeWithAi('TEST')).rejects.toThrow(AiCategorizationError);
      await expect(categorizeWithAi('TEST')).rejects.toThrow('Failed to categorize: ECONNREFUSED');
    });

    it('throws AiCategorizationError when JSON parsing fails', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{invalid json' }],
      });

      await expect(categorizeWithAi('TEST')).rejects.toThrow(AiCategorizationError);
    });

    it('throws AiCategorizationError when API returns malformed response structure', async () => {
      mockCreate.mockResolvedValue({
        content: null, // Malformed
      });

      await expect(categorizeWithAi('TEST')).rejects.toThrow(AiCategorizationError);
    });

    it('throws AiCategorizationError for undefined content', async () => {
      mockCreate.mockResolvedValue({
        content: undefined,
      });

      await expect(categorizeWithAi('TEST')).rejects.toThrow(AiCategorizationError);
    });

    it('throws INSUFFICIENT_CREDITS error when API returns 400 with credit balance message', async () => {
      mockCreate.mockRejectedValue({
        status: 400,
        message: 'Bad request',
        error: {
          error: {
            message:
              'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
          },
        },
      });

      await expect(categorizeWithAi('TEST')).rejects.toThrow(AiCategorizationError);
      await expect(categorizeWithAi('TEST')).rejects.toThrow(/credit balance/i);

      try {
        await categorizeWithAi('TEST');
      } catch (error) {
        expect(error).toBeInstanceOf(AiCategorizationError);
        expect((error as AiCategorizationError).code).toBe('INSUFFICIENT_CREDITS');
      }
    });

    it('throws API_ERROR when API returns 400 without credit balance message', async () => {
      mockCreate.mockRejectedValue({
        status: 400,
        message: 'Invalid request format',
      });

      await expect(categorizeWithAi('TEST')).rejects.toThrow(AiCategorizationError);

      try {
        await categorizeWithAi('TEST');
      } catch (error) {
        expect(error).toBeInstanceOf(AiCategorizationError);
        expect((error as AiCategorizationError).code).toBe('API_ERROR');
      }
    });
  });

  describe('Edge cases', () => {
    it('handles empty rawRow', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Unknown", "category": "Other"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result } = await categorizeWithAi('');

      expect(result?.description).toBe('');
    });

    it('handles very long rawRow', async () => {
      const longRow = 'A'.repeat(10000);
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Test", "category": "Other"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result } = await categorizeWithAi(longRow);

      expect(result).not.toBeNull();
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining(longRow),
            }),
          ]),
        })
      );
    });

    it('calls API with correct model and parameters', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Test", "category": "Other"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      await categorizeWithAi('TEST');

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('TEST'),
          },
        ],
      });
    });

    it('includes transaction data in prompt', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Test", "category": "Other"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      await categorizeWithAi('WOOLWORTHS 1234');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: expect.stringContaining('WOOLWORTHS 1234'),
            },
          ],
        })
      );
    });

    it('handles concurrent calls with same key (cache race)', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          content: [{ type: 'text', text: '{"entityName": "Test", "category": "Other"}' }],
          usage: { input_tokens: 50, output_tokens: 20 },
        });
      });

      // Simulate concurrent calls
      const [response1, response2] = await Promise.all([
        categorizeWithAi('CONCURRENT TEST'),
        categorizeWithAi('CONCURRENT TEST'),
      ]);

      // Both should succeed
      expect(response1.result).not.toBeNull();
      expect(response2.result).not.toBeNull();
      // Due to async timing, might be 1 or 2 API calls
      expect(callCount).toBeGreaterThanOrEqual(1);
      expect(callCount).toBeLessThanOrEqual(2);
    });

    it('handles unicode characters in rawRow', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Café", "category": "Dining"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result } = await categorizeWithAi('CAFÉ ROASTVILLE');

      expect(result?.entityName).toBe('Café');
    });

    it('handles newlines in rawRow', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Test", "category": "Other"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const { result } = await categorizeWithAi('LINE1\nLINE2');

      expect(result?.description).toBe('LINE1\nLINE2');
    });

    it('clearCache function clears the cache', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"entityName": "Test", "category": "Other"}' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      // First call
      await categorizeWithAi('TEST');
      expect(mockCreate).toHaveBeenCalledTimes(1);

      // Clear cache
      clearCache();

      // Second call should hit API again
      await categorizeWithAi('TEST');
      expect(mockCreate).toHaveBeenCalledTimes(2); // Called again after cache clear
    });
  });
});

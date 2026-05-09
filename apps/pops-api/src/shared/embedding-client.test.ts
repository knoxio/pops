/**
 * Provider-aware behavior of the embedding client.
 *
 * The OpenAI body shape (`dimensions`) and the Voyage body shape
 * (`output_dimension` + `input_type`) are not interchangeable; sending the
 * wrong one to either provider produces a 4xx. These tests pin the per-provider
 * request shape and the pricing fallbacks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  detectProvider,
  estimateEmbeddingCost,
  getEmbedding,
  getEmbeddingConfig,
} from './embedding-client.js';

import type { EmbeddingConfig } from './embedding-client.js';

const ORIGINAL_FETCH = global.fetch;

function makeOkResponse(vector: number[]): Response {
  return new Response(
    JSON.stringify({ data: [{ embedding: vector }], usage: { total_tokens: 5 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe('detectProvider', () => {
  it('returns "voyage" for any voyageai.com URL', () => {
    expect(detectProvider('https://api.voyageai.com/v1')).toBe('voyage');
  });

  it('returns "openai" for any other URL', () => {
    expect(detectProvider('https://api.openai.com/v1')).toBe('openai');
    expect(detectProvider('https://example.com/v1')).toBe('openai');
  });
});

describe('getEmbeddingConfig', () => {
  it('inherits provider from URL', () => {
    vi.stubEnv('EMBEDDING_API_URL', 'https://api.voyageai.com/v1');
    vi.stubEnv('EMBEDDING_API_KEY', 'test');
    vi.stubEnv('EMBEDDING_MODEL', 'voyage-4-lite');
    vi.stubEnv('EMBEDDING_DIMENSIONS', '1024');

    const cfg = getEmbeddingConfig();
    expect(cfg.provider).toBe('voyage');
    expect(cfg.model).toBe('voyage-4-lite');
    expect(cfg.dimensions).toBe(1024);
  });

  it('defaults to OpenAI provider', () => {
    vi.stubEnv('EMBEDDING_API_KEY', 'test');
    expect(getEmbeddingConfig().provider).toBe('openai');
  });
});

describe('getEmbedding request shape', () => {
  function captureFetch(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => makeOkResponse([0.1, 0.2, 0.3]));
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('sends OpenAI-shaped body for the openai provider', async () => {
    const fetchMock = captureFetch();
    const config: EmbeddingConfig = {
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      provider: 'openai',
    };

    await getEmbedding('hello', config, { inputType: 'query' });

    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ input: 'hello', model: 'text-embedding-3-small', dimensions: 1536 });
  });

  it('sends Voyage-shaped body (output_dimension + input_type) for the voyage provider', async () => {
    const fetchMock = captureFetch();
    const config: EmbeddingConfig = {
      apiUrl: 'https://api.voyageai.com/v1',
      apiKey: 'pa-test',
      model: 'voyage-4-lite',
      dimensions: 1024,
      provider: 'voyage',
    };

    await getEmbedding('hello', config, { inputType: 'query' });

    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      input: 'hello',
      model: 'voyage-4-lite',
      output_dimension: 1024,
      input_type: 'query',
    });
    // Voyage rejects the OpenAI-only `dimensions` field with a 400.
    expect(body).not.toHaveProperty('dimensions');
  });

  it('defaults inputType to "document" when not provided', async () => {
    const fetchMock = captureFetch();
    const config: EmbeddingConfig = {
      apiUrl: 'https://api.voyageai.com/v1',
      apiKey: 'pa-test',
      model: 'voyage-4-lite',
      dimensions: 1024,
      provider: 'voyage',
    };

    await getEmbedding('hello', config);

    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ input_type: 'document' });
  });

  it('throws on non-OK provider response (callers must catch)', async () => {
    global.fetch = vi.fn(
      async () => new Response('{"detail":"bad"}', { status: 400 })
    ) as unknown as typeof fetch;

    const config: EmbeddingConfig = {
      apiUrl: 'https://api.voyageai.com/v1',
      apiKey: 'pa-test',
      model: 'voyage-4-lite',
      dimensions: 1024,
      provider: 'voyage',
    };

    await expect(getEmbedding('hello', config)).rejects.toThrow(/Embedding API error 400/);
  });
});

describe('estimateEmbeddingCost', () => {
  it('prices known OpenAI models', () => {
    expect(estimateEmbeddingCost(1_000_000, 'text-embedding-3-small')).toBeCloseTo(0.02);
    expect(estimateEmbeddingCost(1_000_000, 'text-embedding-3-large')).toBeCloseTo(0.13);
  });

  it('prices known Voyage models', () => {
    expect(estimateEmbeddingCost(1_000_000, 'voyage-4-lite')).toBeCloseTo(0.02);
    expect(estimateEmbeddingCost(1_000_000, 'voyage-3-large')).toBeCloseTo(0.18);
    expect(estimateEmbeddingCost(1_000_000, 'voyage-finance-2')).toBeCloseTo(0.12);
  });

  it('falls back to small-model pricing for unknown models', () => {
    expect(estimateEmbeddingCost(1_000_000, 'mystery-model')).toBeCloseTo(0.02);
  });
});

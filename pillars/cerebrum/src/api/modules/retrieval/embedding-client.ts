/**
 * Query-embedding client for semantic search (OpenAI- / Voyage-compatible).
 *
 * Configured entirely from environment variables so the model choice is not
 * baked into code:
 *   EMBEDDING_API_URL    — base URL (default https://api.openai.com/v1)
 *   EMBEDDING_API_KEY    — API key (required for real embedding; absent → no
 *                          embedder, semantic search degrades to BM25-only)
 *   EMBEDDING_MODEL      — model name (default text-embedding-3-small)
 *   EMBEDDING_DIMENSIONS — vector dimensions (default 1536, matches the
 *                          `embeddings_vec` virtual table)
 *
 * The retrieval handlers receive an {@link EmbeddingClient} via
 * `CerebrumApiDeps.embeddingClient`. The real default is constructed from env
 * in `server.ts`; when `EMBEDDING_API_KEY` is unset the default is `undefined`
 * so semantic search short-circuits to no semantic results (and hybrid falls
 * back to BM25). Tests inject a fake to exercise the embed path without a live
 * provider.
 */
type EmbeddingProvider = 'openai' | 'voyage';

export interface EmbeddingClient {
  /** Embed a retrieval query into a dense vector. */
  embedQuery(query: string): Promise<number[]>;
}

interface EmbeddingConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  provider: EmbeddingProvider;
}

function detectProvider(apiUrl: string): EmbeddingProvider {
  return apiUrl.includes('voyageai.com') ? 'voyage' : 'openai';
}

function readEmbeddingConfig(): EmbeddingConfig {
  const apiUrl = process.env['EMBEDDING_API_URL'] ?? 'https://api.openai.com/v1';
  return {
    apiUrl,
    apiKey: process.env['EMBEDDING_API_KEY'] ?? '',
    model: process.env['EMBEDDING_MODEL'] ?? 'text-embedding-3-small',
    dimensions: Number.parseInt(process.env['EMBEDDING_DIMENSIONS'] ?? '1536', 10),
    provider: detectProvider(apiUrl),
  };
}

function buildRequestBody(text: string, config: EmbeddingConfig): Record<string, unknown> {
  if (config.provider === 'voyage') {
    return {
      input: text,
      model: config.model,
      output_dimension: config.dimensions,
      input_type: 'query',
    };
  }
  return { input: text, model: config.model, dimensions: config.dimensions };
}

type FetchImpl = typeof globalThis.fetch;

/**
 * Build the HTTP-backed embedding client. `fetchImpl` is injectable so tests
 * can drive it without a live provider.
 */
export function createHttpEmbeddingClient(
  config: EmbeddingConfig,
  fetchImpl: FetchImpl = globalThis.fetch
): EmbeddingClient {
  return {
    async embedQuery(query) {
      if (!query.trim()) throw new Error('Cannot embed empty text');
      if (!config.apiKey) throw new Error('EMBEDDING_API_KEY is not configured');

      const response = await fetchImpl(`${config.apiUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildRequestBody(query, config)),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Embedding API error ${response.status}: ${body}`);
      }

      const data = (await response.json()) as { data: { embedding: number[] }[] };
      const vector = data.data[0]?.embedding;
      if (!vector) throw new Error('Embedding API returned no vector');
      return vector;
    },
  };
}

/**
 * Construct the env-driven embedding client, or `undefined` when no
 * `EMBEDDING_API_KEY` is configured. A missing client makes semantic search
 * degrade to no semantic results (hybrid falls back to BM25-only).
 */
export function resolveEmbeddingClientFromEnv(): EmbeddingClient | undefined {
  const config = readEmbeddingConfig();
  if (!config.apiKey) return undefined;
  return createHttpEmbeddingClient(config);
}

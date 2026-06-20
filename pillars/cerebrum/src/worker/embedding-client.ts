/**
 * Document-embedding API client for the cerebrum worker (OpenAI- / Voyage-
 * compatible), lifted from the monolith `apps/pops-api/src/shared/embedding-
 * client.ts`.
 *
 * The retrieval slice already ships a *query*-embedding client
 * (`src/api/modules/retrieval/embedding-client.ts`, `embedQuery`, `input_type:
 * 'query'`). This is its write-side counterpart — it embeds *documents*
 * (`input_type: 'document'`) for the index, exposing the monolith's
 * `getEmbedding` / `getEmbeddingConfig` / `isEmbeddingConfigured` surface so the
 * embeddings handler can chunk-and-store.
 *
 * Configured entirely via environment variables so the model choice is not
 * baked into code:
 *   EMBEDDING_API_URL    — base URL (default https://api.openai.com/v1)
 *   EMBEDDING_API_KEY    — API key (required for real embedding)
 *   EMBEDDING_MODEL      — model name (default text-embedding-3-small)
 *   EMBEDDING_DIMENSIONS — vector dimensions (default 1536, matches the
 *                          `embeddings_vec` virtual table)
 *
 * `getEmbedding` takes the config + an injected `fetchImpl` so tests drive it
 * without a live provider; the handler injects an {@link EmbeddingPort} so it
 * never touches the network in unit tests.
 */
export type EmbeddingProvider = 'openai' | 'voyage';

export type EmbeddingInputType = 'query' | 'document';

export interface EmbeddingConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  provider: EmbeddingProvider;
}

/** Detect the provider from the configured base URL. Defaults to openai. */
export function detectProvider(apiUrl: string): EmbeddingProvider {
  return apiUrl.includes('voyageai.com') ? 'voyage' : 'openai';
}

/** Read the embedding config from the environment, with OpenAI defaults. */
export function getEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
  const apiUrl = env['EMBEDDING_API_URL'] ?? 'https://api.openai.com/v1';
  return {
    apiUrl,
    apiKey: env['EMBEDDING_API_KEY'] ?? '',
    model: env['EMBEDDING_MODEL'] ?? 'text-embedding-3-small',
    dimensions: Number.parseInt(env['EMBEDDING_DIMENSIONS'] ?? '1536', 10),
    provider: detectProvider(apiUrl),
  };
}

/** Returns true when `EMBEDDING_API_KEY` is present and non-empty. */
export function isEmbeddingConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env['EMBEDDING_API_KEY']);
}

function buildRequestBody(
  text: string,
  config: EmbeddingConfig,
  inputType: EmbeddingInputType
): Record<string, unknown> {
  if (config.provider === 'voyage') {
    return {
      input: text,
      model: config.model,
      output_dimension: config.dimensions,
      input_type: inputType,
    };
  }
  return { input: text, model: config.model, dimensions: config.dimensions };
}

export interface GetEmbeddingOptions {
  /**
   * Whether the text is a retrieval query or a document being indexed. Voyage
   * uses this to pick the embedding head; OpenAI ignores it. Defaults to
   * 'document' (the index write path).
   */
  inputType?: EmbeddingInputType;
}

type FetchImpl = typeof globalThis.fetch;

/** Embed a single text into a dense vector via the configured provider. */
export async function getEmbedding(
  text: string,
  config: EmbeddingConfig,
  options: GetEmbeddingOptions = {},
  fetchImpl: FetchImpl = globalThis.fetch
): Promise<number[]> {
  if (!text.trim()) throw new Error('Cannot embed empty text');
  if (!config.apiKey) throw new Error('EMBEDDING_API_KEY is not configured');

  const inputType = options.inputType ?? 'document';
  const response = await fetchImpl(`${config.apiUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(buildRequestBody(text, config, inputType)),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Embedding API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as { data: { embedding: number[] }[] };
  const vector = data.data[0]?.embedding;
  if (!vector) throw new Error('Embedding API returned no vector');
  return vector;
}

/**
 * Injection port for the embeddings handler: embed one document chunk into a
 * dense vector, exposing the active model + dimensions for the metadata write.
 * The env-backed default is built by {@link resolveEmbeddingPortFromEnv}; tests
 * inject a fake.
 */
export interface EmbeddingPort {
  embedDocument(text: string): Promise<number[]>;
  model: string;
  dimensions: number;
}

/**
 * Build the env-driven {@link EmbeddingPort}, or `undefined` when no
 * `EMBEDDING_API_KEY` is configured (the worker then skips embedding jobs
 * rather than throwing on every chunk).
 */
export function resolveEmbeddingPortFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchImpl = globalThis.fetch
): EmbeddingPort | undefined {
  if (!isEmbeddingConfigured(env)) return undefined;
  const config = getEmbeddingConfig(env);
  return {
    model: config.model,
    dimensions: config.dimensions,
    embedDocument: (text) => getEmbedding(text, config, { inputType: 'document' }, fetchImpl),
  };
}

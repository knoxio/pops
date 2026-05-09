/**
 * Embeddings API client supporting OpenAI- and Voyage-compatible providers.
 *
 * Configured entirely via environment variables so model choice is not baked into code:
 *   EMBEDDING_API_URL  — base URL (default: https://api.openai.com/v1)
 *   EMBEDDING_API_KEY  — API key (required for production)
 *   EMBEDDING_MODEL    — model name (default: text-embedding-3-small)
 *   EMBEDDING_DIMENSIONS — vector dimensions (default: 1536)
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

/** Detect provider from the configured base URL. Defaults to openai. */
export function detectProvider(apiUrl: string): EmbeddingProvider {
  return apiUrl.includes('voyageai.com') ? 'voyage' : 'openai';
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const apiUrl = process.env['EMBEDDING_API_URL'] ?? 'https://api.openai.com/v1';
  return {
    apiUrl,
    apiKey: process.env['EMBEDDING_API_KEY'] ?? '',
    model: process.env['EMBEDDING_MODEL'] ?? 'text-embedding-3-small',
    dimensions: parseInt(process.env['EMBEDDING_DIMENSIONS'] ?? '1536', 10),
    provider: detectProvider(apiUrl),
  };
}

/** Returns true when EMBEDDING_API_KEY is present and non-empty. */
export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env['EMBEDDING_API_KEY']);
}

/** Build the provider-specific request body. */
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
  return {
    input: text,
    model: config.model,
    dimensions: config.dimensions,
  };
}

export interface GetEmbeddingOptions {
  /**
   * Whether the text is a retrieval query or a document being indexed.
   * Voyage uses this to pick the appropriate embedding head; OpenAI ignores it.
   * Defaults to 'document' to match OpenAI's symmetric behavior.
   */
  inputType?: EmbeddingInputType;
}

export async function getEmbedding(
  text: string,
  config: EmbeddingConfig,
  options: GetEmbeddingOptions = {}
): Promise<number[]> {
  if (!text.trim()) {
    throw new Error('Cannot embed empty text');
  }
  if (!config.apiKey) {
    throw new Error('EMBEDDING_API_KEY is not configured');
  }

  const inputType = options.inputType ?? 'document';
  const response = await fetch(`${config.apiUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(buildRequestBody(text, config, inputType)),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Embedding API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    data: { embedding: number[] }[];
    usage?: { total_tokens?: number };
  };
  const vector = data.data[0]?.embedding;
  if (!vector) {
    throw new Error('Embedding API returned no vector');
  }
  return vector;
}

export interface EmbeddingUsage {
  totalTokens: number;
  costUsd: number;
}

interface PricingEntry {
  match: (model: string) => boolean;
  pricePerMillion: number;
}

// Per-provider pricing in USD per 1M input tokens.
// OpenAI: https://openai.com/pricing
// Voyage:  https://docs.voyageai.com/docs/pricing
const PRICING: PricingEntry[] = [
  { match: (m) => m.includes('text-embedding-3-large'), pricePerMillion: 0.13 },
  { match: (m) => m.includes('text-embedding-3-small'), pricePerMillion: 0.02 },
  { match: (m) => m === 'voyage-3-large', pricePerMillion: 0.18 },
  { match: (m) => m === 'voyage-code-3', pricePerMillion: 0.18 },
  { match: (m) => m === 'voyage-finance-2', pricePerMillion: 0.12 },
  { match: (m) => m === 'voyage-law-2', pricePerMillion: 0.12 },
  { match: (m) => m === 'voyage-3.5', pricePerMillion: 0.06 },
  { match: (m) => m === 'voyage-3.5-lite', pricePerMillion: 0.02 },
  { match: (m) => m === 'voyage-4', pricePerMillion: 0.06 },
  { match: (m) => m === 'voyage-4-lite', pricePerMillion: 0.02 },
];

/** Estimate cost from token usage based on the model name. */
export function estimateEmbeddingCost(totalTokens: number, model: string): number {
  const entry = PRICING.find((p) => p.match(model));
  // Fallback to OpenAI text-embedding-3-small pricing for unknown models.
  const pricePerMillion = entry?.pricePerMillion ?? 0.02;
  return (totalTokens / 1_000_000) * pricePerMillion;
}

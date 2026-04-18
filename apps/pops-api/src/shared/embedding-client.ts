/**
 * OpenAI-compatible embeddings API client.
 *
 * Configured entirely via environment variables so model choice is not baked into code:
 *   EMBEDDING_API_URL  — base URL (default: https://api.openai.com/v1)
 *   EMBEDDING_API_KEY  — API key (required for production)
 *   EMBEDDING_MODEL    — model name (default: text-embedding-3-small)
 *   EMBEDDING_DIMENSIONS — vector dimensions (default: 1536)
 */

export interface EmbeddingConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
}

export function getEmbeddingConfig(): EmbeddingConfig {
  return {
    apiUrl: process.env['EMBEDDING_API_URL'] ?? 'https://api.openai.com/v1',
    apiKey: process.env['EMBEDDING_API_KEY'] ?? '',
    model: process.env['EMBEDDING_MODEL'] ?? 'text-embedding-3-small',
    dimensions: parseInt(process.env['EMBEDDING_DIMENSIONS'] ?? '1536', 10),
  };
}

export async function getEmbedding(text: string, config: EmbeddingConfig): Promise<number[]> {
  if (!text.trim()) {
    throw new Error('Cannot embed empty text');
  }
  if (!config.apiKey) {
    throw new Error('EMBEDDING_API_KEY is not configured');
  }

  const response = await fetch(`${config.apiUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: config.model,
      dimensions: config.dimensions,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Embedding API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    data: { embedding: number[] }[];
    usage: { total_tokens: number };
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

/** Estimate cost from token usage (OpenAI text-embedding-3-small pricing). */
export function estimateEmbeddingCost(totalTokens: number, model: string): number {
  // text-embedding-3-small: $0.02 / 1M tokens
  // text-embedding-3-large: $0.13 / 1M tokens
  // Fallback to small pricing for unknown models
  const pricePerMillion = model.includes('large') ? 0.13 : 0.02;
  return (totalTokens / 1_000_000) * pricePerMillion;
}

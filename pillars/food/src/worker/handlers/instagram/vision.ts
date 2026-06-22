/**
 * PRD-130 — Claude vision call.
 *
 * One multimodal `messages.create` request: caption + transcript text +
 * up to 5 base64-encoded keyframes (the highest-scoring scene-detection
 * picks by ffmpeg ordering). Response is strict-parsed via `JSON.parse`
 * and validated with the local zod schema; anything else raises.
 *
 * Keyframes beyond `MAX_KEYFRAMES_TO_VISION` are dropped — the PRD caps
 * the vision payload at 5 even when ffmpeg produced 10.
 */
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import { callWithLogging } from '@pops/ai-telemetry';

import { ANTHROPIC_PROVIDER, FOOD_DOMAIN, foodTelemetryDeps } from '../../ai/ai-telemetry-deps.js';
import { PROMPT_VERSION_IG_VISION, renderIgVisionPrompt } from '../../prompts/ig-vision.js';
import { extractedRecipeSchema, type ExtractedRecipe } from './extracted-recipe.js';

import type { AnthropicLike, AnthropicMessage } from './anthropic-client.js';

export const MAX_KEYFRAMES_TO_VISION = 5;
export const DEFAULT_IG_VISION_MODEL = 'claude-haiku-4-5-20251001';
export const IG_VISION_OPERATION = 'recipe-extract-ig-vision';

const MAX_TOKENS = 2_000;

export interface ExtractWithVisionInput {
  caption: string | null;
  transcript: string | null;
  keyframePaths: readonly string[];
}

export interface ExtractWithVisionOptions {
  client: AnthropicLike;
  model?: string;
  /** Test seam: substitute the file reader for keyframe images. */
  readFileImpl?: (path: string) => Promise<Buffer>;
}

export interface VisionResult {
  parsed: ExtractedRecipe;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  keyframesSent: number;
  durationMs: number;
}

export async function extractWithClaudeVision(
  input: ExtractWithVisionInput,
  opts: ExtractWithVisionOptions
): Promise<VisionResult> {
  const model = opts.model ?? DEFAULT_IG_VISION_MODEL;
  const readImpl = opts.readFileImpl ?? readFile;
  const selected = input.keyframePaths.slice(0, MAX_KEYFRAMES_TO_VISION);
  const imageBlocks = await Promise.all(selected.map((p) => imageBlock(p, readImpl)));
  const prompt = renderIgVisionPrompt({
    caption: input.caption,
    transcript: input.transcript,
    keyframeCount: selected.length,
  });

  const start = Date.now();
  const response = await callWithLogging<AnthropicMessage>(
    {
      provider: ANTHROPIC_PROVIDER,
      model,
      operation: IG_VISION_OPERATION,
      domain: FOOD_DOMAIN,
      promptVersion: PROMPT_VERSION_IG_VISION,
      call: async () => {
        const message = await opts.client.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          messages: [
            {
              role: 'user',
              content: [...imageBlocks, { type: 'text', text: prompt }],
            },
          ],
        });
        return {
          response: message,
          usage: {
            inputTokens: message.usage?.input_tokens ?? 0,
            outputTokens: message.usage?.output_tokens ?? 0,
          },
        };
      },
    },
    foodTelemetryDeps()
  );
  const durationMs = Date.now() - start;

  const text = firstTextBlock(response);
  if (text === null) throw new VisionExtractError('Anthropic response had no text block');
  const parsed = parseAndValidate(text);
  return {
    parsed,
    model,
    promptVersion: PROMPT_VERSION_IG_VISION,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    keyframesSent: selected.length,
    durationMs,
  };
}

function firstTextBlock(message: AnthropicMessage): string | null {
  for (const block of message.content) {
    if (block.type === 'text' && block.text.trim().length > 0) return block.text;
  }
  return null;
}

function parseAndValidate(text: string): ExtractedRecipe {
  if (/^\s*```/.test(text)) {
    throw new VisionExtractError('Anthropic response wrapped JSON in a markdown fence');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new VisionExtractError(
      `Anthropic response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const result = extractedRecipeSchema.safeParse(raw);
  if (!result.success) {
    throw new VisionExtractError(
      `Anthropic response did not match the recipe schema: ${result.error.message}`
    );
  }
  return result.data;
}

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

interface ImageBlock {
  type: 'image';
  source: { type: 'base64'; media_type: SupportedMediaType; data: string };
}

async function imageBlock(
  path: string,
  readImpl: (path: string) => Promise<Buffer>
): Promise<ImageBlock> {
  const buffer = await readImpl(path);
  const mediaType = mediaTypeFor(path);
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') },
  };
}

function mediaTypeFor(path: string): SupportedMediaType {
  switch (extname(path).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

export class VisionExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisionExtractError';
  }
}

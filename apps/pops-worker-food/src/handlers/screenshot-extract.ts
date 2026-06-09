/**
 * PRD-131 screenshot extraction pipeline.
 *
 * Runs file read → Claude vision → JSON parse → zod validation,
 * returning the structured `ParsedRecipe` (or a typed failure) for the
 * handler to combine with DSL build + meta-JSON assembly. Keeping DSL
 * build out of this module lets the handler insert a cancellation
 * check between the vision call and the DSL build (see PRD-131
 * cancellation contract).
 */
import { readFile } from 'node:fs/promises';

import { extractWithClaudeVision, type VisionCallResult } from '../ai/anthropic-client.js';
import {
  PROMPT_VERSION_SCREENSHOT,
  SCREENSHOT_DEFAULT_MODEL,
  SCREENSHOT_PROMPT,
} from '../prompts/screenshot.js';
import { parsedRecipeSchema, type ParsedRecipe } from './screenshot-dsl.js';

export interface ExtractInput {
  contentPath: string;
  mimeType: string;
  model?: string;
}

interface FileReadStage {
  ok: boolean;
  durationMs: number;
  bytes?: number;
  error?: string;
}

interface VisionStage {
  ok: boolean;
  durationMs: number;
  raw?: string;
  error?: string;
}

export type ExtractRecipeResult =
  | {
      ok: true;
      parsed: ParsedRecipe;
      vision: VisionCallResult;
      promptVersion: string;
      stages: {
        fileRead: FileReadStage & { ok: true; bytes: number };
        vision: VisionStage & { ok: true; raw: string };
      };
    }
  | {
      ok: false;
      errorCode: 'FileReadFailed' | 'VisionExtractFailed';
      errorMessage: string;
      vision?: VisionCallResult;
      promptVersion: string;
      stages: {
        fileRead?: FileReadStage;
        vision?: VisionStage;
      };
    };

function summarise(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function readImage(
  path: string
): Promise<{ buffer: Buffer; durationMs: number } | { error: string; durationMs: number }> {
  const start = Date.now();
  try {
    const buffer = await readFile(path);
    return { buffer, durationMs: Date.now() - start };
  } catch (err) {
    return { error: summarise(err), durationMs: Date.now() - start };
  }
}

function fileReadFailure(path: string, error: string, durationMs: number): ExtractRecipeResult {
  return {
    ok: false,
    errorCode: 'FileReadFailed',
    errorMessage: `Failed to read image at ${path}: ${error}`,
    promptVersion: PROMPT_VERSION_SCREENSHOT,
    stages: { fileRead: { ok: false, durationMs, error } },
  };
}

interface VisionFailureArgs {
  message: string;
  fileReadDuration: number;
  bytes: number;
  vision?: VisionCallResult;
  raw?: string;
}

function visionFailure(args: VisionFailureArgs): ExtractRecipeResult {
  const { message, fileReadDuration, bytes, vision, raw } = args;
  return {
    ok: false,
    errorCode: 'VisionExtractFailed',
    errorMessage: message,
    ...(vision && { vision }),
    promptVersion: PROMPT_VERSION_SCREENSHOT,
    stages: {
      fileRead: { ok: true, durationMs: fileReadDuration, bytes },
      vision: {
        ok: false,
        durationMs: vision?.latencyMs ?? 0,
        ...(raw != null && { raw }),
        error: message,
      },
    },
  };
}

async function callVision(
  buffer: Buffer,
  mimeType: string,
  model: string
): Promise<{ vision: VisionCallResult } | { error: string }> {
  try {
    const vision = await extractWithClaudeVision({
      mimeType,
      base64: buffer.toString('base64'),
      prompt: SCREENSHOT_PROMPT,
      model,
    });
    return { vision };
  } catch (err) {
    return { error: `Claude vision call failed: ${summarise(err)}` };
  }
}

function parseAndValidate(raw: string): { parsed: ParsedRecipe } | { error: string } {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch (err) {
    return { error: `Vision response was not valid JSON: ${summarise(err)}` };
  }
  const validated = parsedRecipeSchema.safeParse(candidate);
  if (!validated.success) {
    return { error: `Vision response failed schema validation: ${validated.error.message}` };
  }
  return { parsed: validated.data };
}

export async function extractRecipeFromImage(input: ExtractInput): Promise<ExtractRecipeResult> {
  const model = input.model ?? SCREENSHOT_DEFAULT_MODEL;
  const read = await readImage(input.contentPath);
  if ('error' in read) {
    return fileReadFailure(input.contentPath, read.error, read.durationMs);
  }
  const { buffer, durationMs: fileReadDuration } = read;

  const visionOutcome = await callVision(buffer, input.mimeType, model);
  if ('error' in visionOutcome) {
    return visionFailure({
      message: visionOutcome.error,
      fileReadDuration,
      bytes: buffer.byteLength,
    });
  }
  const { vision } = visionOutcome;

  const parsedOutcome = parseAndValidate(vision.text);
  if ('error' in parsedOutcome) {
    return visionFailure({
      message: parsedOutcome.error,
      fileReadDuration,
      bytes: buffer.byteLength,
      vision,
      raw: vision.text,
    });
  }

  return {
    ok: true,
    parsed: parsedOutcome.parsed,
    vision,
    promptVersion: PROMPT_VERSION_SCREENSHOT,
    stages: {
      fileRead: { ok: true, durationMs: fileReadDuration, bytes: buffer.byteLength },
      vision: { ok: true, durationMs: vision.latencyMs, raw: vision.text },
    },
  };
}

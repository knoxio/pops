/**
 * cerebrum.quick_capture — lowest-friction agent-driven capture (PRD-081 US-02, US-03).
 *
 * Thin wrapper around `IngestService.quickCapture`. Agents (Claude Code,
 * Moltbot, scripts) call this when they want to land a raw thought as an
 * engram immediately — classification, entity extraction, and scope inference
 * are deferred to the curation worker. The response includes the engram id,
 * file path, type, and scopes so the agent can echo the id back to the user.
 */
import { ENGRAM_SOURCES, type EngramSource } from '../engrams/schema.js';
import { IngestService } from '../ingest/pipeline.js';
import { mapServiceError, toolError, toolSuccess } from './result.js';

import type { AiToolResult } from '@pops/types';

const PLEXUS_SOURCE_PATTERN = /^plexus:.+$/;

function isEngramSource(value: unknown): value is EngramSource {
  if (typeof value !== 'string') return false;
  if ((ENGRAM_SOURCES as readonly string[]).includes(value)) return true;
  return PLEXUS_SOURCE_PATTERN.test(value);
}

export async function handleCerebrumQuickCapture(
  raw: Record<string, unknown>
): Promise<AiToolResult> {
  const text = typeof raw['text'] === 'string' ? raw['text'] : '';
  const source = isEngramSource(raw['source']) ? raw['source'] : undefined;

  if (!text.trim()) {
    return toolError('text is required and must be non-empty', 'VALIDATION_ERROR');
  }

  try {
    const svc = new IngestService();
    const result = await svc.quickCapture(text, source);
    return toolSuccess({
      engram: {
        id: result.id,
        filePath: result.path,
        type: result.type,
        scopes: result.scopes,
      },
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** JSON Schema for the cerebrum.quick_capture tool input. */
export const cerebrumQuickCaptureSchema = {
  type: 'object' as const,
  properties: {
    text: {
      type: 'string' as const,
      minLength: 1,
      pattern: '\\S',
      description:
        'Raw text to capture. Must contain at least one non-whitespace character. Stored immediately as a capture engram; classification, entity extraction, and scope inference run asynchronously.',
    },
    source: {
      type: 'string' as const,
      description:
        'Origin of the capture. One of the known engram sources (manual, agent, moltbot, cli) or a `plexus:{name}` identifier for plugin-driven ingestion. Falls through to the IngestService default when omitted.',
    },
  },
  required: ['text'] as const,
};

/**
 * Tests for the cerebrum.quick_capture MCP tool (PRD-081 US-02 AC #2).
 *
 * Verifies that the tool delegates to `IngestService.quickCapture` with the
 * agent-supplied text and source, surfaces the resulting engram id/path/type/
 * scopes, and rejects empty input.
 */
import { describe, expect, it, vi } from 'vitest';

import { parseResult } from './test-helpers.js';

const quickCaptureCalls: { text: string; source: string | undefined }[] = [];

vi.mock('../../ingest/pipeline.js', () => ({
  IngestService: class MockIngestService {
    async quickCapture(text: string, source?: string) {
      quickCaptureCalls.push({ text, source });
      return {
        id: 'eng_20260427_1500_quick',
        path: 'capture/eng_20260427_1500_quick.md',
        type: 'capture',
        scopes: ['personal.captures'],
      };
    }
  },
}));

const { handleCerebrumQuickCapture } = await import('../quick-capture.js');

describe('handleCerebrumQuickCapture', () => {
  it('returns VALIDATION_ERROR for empty text', async () => {
    const result = await handleCerebrumQuickCapture({ text: '   ' });
    const parsed = parseResult(result) as { error: string; code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
    expect(result.isError).toBe(true);
  });

  it('returns VALIDATION_ERROR when text is missing', async () => {
    const result = await handleCerebrumQuickCapture({});
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
  });

  it('delegates to IngestService.quickCapture and returns engram metadata', async () => {
    quickCaptureCalls.length = 0;
    const result = await handleCerebrumQuickCapture({ text: 'A raw thought' });
    expect(result.isError).toBeUndefined();
    expect(quickCaptureCalls[0]).toEqual({ text: 'A raw thought', source: undefined });

    const parsed = parseResult(result) as {
      engram: { id: string; filePath: string; type: string; scopes: string[] };
    };
    expect(parsed.engram).toEqual({
      id: 'eng_20260427_1500_quick',
      filePath: 'capture/eng_20260427_1500_quick.md',
      type: 'capture',
      scopes: ['personal.captures'],
    });
  });

  it('forwards a recognised source when provided', async () => {
    quickCaptureCalls.length = 0;
    await handleCerebrumQuickCapture({ text: 'from moltbot', source: 'moltbot' });
    expect(quickCaptureCalls[0]?.source).toBe('moltbot');
  });

  it('forwards plexus:* sources for plugin-driven ingestion', async () => {
    quickCaptureCalls.length = 0;
    await handleCerebrumQuickCapture({ text: 'from plugin', source: 'plexus:notion' });
    expect(quickCaptureCalls[0]?.source).toBe('plexus:notion');
  });

  it('drops unrecognised sources and falls through to the service default', async () => {
    quickCaptureCalls.length = 0;
    await handleCerebrumQuickCapture({ text: 'mystery', source: 'unknown-source' });
    expect(quickCaptureCalls[0]?.source).toBeUndefined();
  });
});

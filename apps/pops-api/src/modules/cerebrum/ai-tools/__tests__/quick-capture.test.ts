/**
 * Tests for the cerebrum.quick_capture MCP tool (PRD-081 US-02 AC #2).
 *
 * Verifies that the tool delegates to `IngestService.quickCapture` with the
 * agent-supplied text and source, surfaces the resulting engram id/path/type/
 * scopes, and rejects empty input.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseResult } from './test-helpers.js';

const quickCaptureCalls: { text: string; source: string | undefined }[] = [];

const defaultResponse = {
  id: 'eng_20260427_1500_quick',
  path: 'capture/eng_20260427_1500_quick.md',
  type: 'capture',
  scopes: ['personal.captures'],
};

let quickCaptureImpl: (text: string, source?: string) => Promise<typeof defaultResponse> = async (
  text,
  source
) => {
  quickCaptureCalls.push({ text, source });
  return defaultResponse;
};

vi.mock('../../ingest/pipeline.js', () => ({
  IngestService: class MockIngestService {
    quickCapture(text: string, source?: string) {
      return quickCaptureImpl(text, source);
    }
  },
}));

const { handleCerebrumQuickCapture } = await import('../quick-capture.js');
const { NotFoundError, ValidationError } = await import('../../../../shared/errors.js');

describe('handleCerebrumQuickCapture', () => {
  afterEach(() => {
    // Restore default impl in case a test swapped it out.
    quickCaptureImpl = async (text, source) => {
      quickCaptureCalls.push({ text, source });
      return defaultResponse;
    };
  });
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

  it('rejects a bare `plexus:` source (the pattern requires a name)', async () => {
    quickCaptureCalls.length = 0;
    await handleCerebrumQuickCapture({ text: 'no name', source: 'plexus:' });
    expect(quickCaptureCalls[0]?.source).toBeUndefined();
  });

  it('maps a thrown ValidationError to a VALIDATION_ERROR tool result', async () => {
    quickCaptureImpl = async () => {
      throw new ValidationError({ message: 'engram body is empty' });
    };
    const result = await handleCerebrumQuickCapture({ text: 'will throw' });
    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { error: string; code: string };
    expect(parsed.code).toBe('VALIDATION_ERROR');
    // ValidationError surfaces the generic "Validation failed" message —
    // details ride along in the underlying error object but mapServiceError
    // intentionally only forwards the message string.
    expect(parsed.error).toContain('Validation failed');
  });

  it('maps a thrown NotFoundError to a NOT_FOUND tool result', async () => {
    quickCaptureImpl = async () => {
      throw new NotFoundError('CurationQueue', 'redis');
    };
    const result = await handleCerebrumQuickCapture({ text: 'will throw' });
    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('NOT_FOUND');
  });

  it('maps an unknown error to a generic INTERNAL_ERROR result without leaking internals', async () => {
    quickCaptureImpl = async () => {
      throw new Error('SELECT * FROM engrams failed: connection refused');
    };
    const result = await handleCerebrumQuickCapture({ text: 'will throw' });
    expect(result.isError).toBe(true);
    const parsed = parseResult(result) as { error: string; code: string };
    expect(parsed.code).toBe('INTERNAL_ERROR');
    expect(parsed.error).not.toContain('SELECT');
  });
});

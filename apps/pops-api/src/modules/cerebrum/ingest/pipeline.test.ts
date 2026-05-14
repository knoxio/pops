/**
 * Tests for IngestService.quickCapture (PRD-081 US-01).
 *
 * Verifies that user-suggested scopes flow through to the engram with
 * `_reconcile_scopes: true` so the curation worker (US-10) preserves them
 * and runs reconciliation, while the legacy fallback path is unchanged
 * for callers that don't supply scopes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();
const mockInferScopes = vi.fn();
const mockQueueAdd = vi.fn();

vi.mock('../instance.js', () => ({
  getEngramService: () => ({ create: mockCreate }),
  getScopeRuleEngine: () => ({
    inferScopes: (...args: unknown[]) => mockInferScopes(...args),
    getConfig: () => ({}),
  }),
}));

vi.mock('../../../jobs/queues.js', () => ({
  getCurationQueue: () => ({ add: (...args: unknown[]) => mockQueueAdd(...args) }),
}));

const { IngestService } = await import('./pipeline.js');

function expectCreateCall() {
  return mockCreate.mock.calls[0]?.[0] as Record<string, unknown>;
}

describe('IngestService.quickCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockImplementation((input: Record<string, unknown>) => ({
      id: 'eng_20260514_1700_test',
      filePath: 'capture/eng_20260514_1700_test.md',
      type: input['type'],
      scopes: input['scopes'],
    }));
    mockInferScopes.mockReturnValue(['personal.captures']);
    mockQueueAdd.mockResolvedValue(undefined);
  });

  it('writes the fallback scope and omits _reconcile_scopes when no scopes are suggested', async () => {
    const svc = new IngestService();
    const result = await svc.quickCapture('hello world');

    expect(mockInferScopes).toHaveBeenCalledOnce();
    const createInput = expectCreateCall();
    expect(createInput['scopes']).toEqual(['personal.captures']);
    expect(createInput['customFields']).toBeUndefined();
    expect(result.scopes).toEqual(['personal.captures']);
  });

  it('preserves user-suggested scopes and sets _reconcile_scopes when scopes are provided', async () => {
    const svc = new IngestService();
    const result = await svc.quickCapture('hello world', 'manual', ['work.karbon.fedx.meetings']);

    expect(mockInferScopes).not.toHaveBeenCalled();
    const createInput = expectCreateCall();
    expect(createInput['scopes']).toEqual(['work.karbon.fedx.meetings']);
    expect(createInput['customFields']).toEqual({ _reconcile_scopes: true });
    expect(result.scopes).toEqual(['work.karbon.fedx.meetings']);
  });

  it('treats an empty suggested-scopes array as no suggestions (falls back)', async () => {
    const svc = new IngestService();
    await svc.quickCapture('hello world', 'manual', []);

    expect(mockInferScopes).toHaveBeenCalledOnce();
    const createInput = expectCreateCall();
    expect(createInput['customFields']).toBeUndefined();
  });

  it('drops whitespace-only suggested scopes and falls back when none survive trimming', async () => {
    const svc = new IngestService();
    await svc.quickCapture('hello world', 'manual', ['   ', '\t\n']);

    expect(mockInferScopes).toHaveBeenCalledOnce();
    const createInput = expectCreateCall();
    expect(createInput['customFields']).toBeUndefined();
  });

  it('trims leading/trailing whitespace from suggested scopes before writing', async () => {
    const svc = new IngestService();
    await svc.quickCapture('hello world', 'manual', ['  work.karbon.fedx.meetings  ']);

    const createInput = expectCreateCall();
    expect(createInput['scopes']).toEqual(['work.karbon.fedx.meetings']);
    expect(createInput['customFields']).toEqual({ _reconcile_scopes: true });
  });

  it('always enqueues the classifyEngram job after writing', async () => {
    const svc = new IngestService();
    await svc.quickCapture('hello world', 'manual', ['work.karbon.fedx.meetings']);

    expect(mockQueueAdd).toHaveBeenCalledWith('classifyEngram', {
      type: 'classifyEngram',
      engramId: 'eng_20260514_1700_test',
    });
  });
});

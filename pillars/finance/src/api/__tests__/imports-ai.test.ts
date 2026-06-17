/**
 * F2 integration test: with the categorizer ENABLED and the Anthropic SDK
 * mocked, an otherwise-unmatched import row is routed to the AI fallback and
 * its suggestion surfaces in the polled result (uncertain bucket, matchType
 * 'ai') with AI usage recorded. Proves the categorizer is wired into the
 * process pipeline end-to-end.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

const { openFinanceDb } = await import('../../db/index.js');
type OpenedFinanceDb = Awaited<ReturnType<typeof openFinanceDb>>;
const { createFinanceApiApp } = await import('../app.js');
const { clearProgress } = await import('../modules/imports/index.js');
const { makeClient, waitForImportCompletion } = await import('./test-utils.js');

type ProcessImportOutput = import('../modules/imports/types.js').ProcessImportOutput;

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  createMock.mockReset();
  process.env['FINANCE_AI_CATEGORIZER_ENABLED'] = 'true';
  process.env['ANTHROPIC_API_KEY'] = 'sk-test';
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-imports-ai-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  clearProgress();
});

afterEach(() => {
  delete process.env['FINANCE_AI_CATEGORIZER_ENABLED'];
  delete process.env['ANTHROPIC_API_KEY'];
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({ financeDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3004' })
  );
}

describe('imports — AI categorizer wired (F2)', () => {
  it('routes an unmatched row to the AI fallback and surfaces the suggestion', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"entityName":"Aldi","tags":["groceries"]}' }],
      usage: { input_tokens: 80, output_tokens: 12 },
    });
    const c = client();

    const { sessionId } = await c.imports.processImport({
      transactions: [
        {
          date: '2026-01-01',
          description: 'ALDI STORES 4823',
          amount: -50,
          account: 'Amex',
          rawRow: 'ALDI STORES 4823,-50',
          checksum: 'ai-row-1',
        },
      ],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0]?.entity.entityName).toBe('Aldi');
    expect(result.uncertain[0]?.entity.matchType).toBe('ai');
    expect(result.aiUsage).toBeDefined();
    expect(result.aiUsage?.apiCalls).toBe(1);
  });
});

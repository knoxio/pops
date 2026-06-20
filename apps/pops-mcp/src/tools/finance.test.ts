import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callContractMismatch,
  callOk,
  callUnavailable,
  mockPillarCore,
  mockPillarFinance,
  pillarMockGetter,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { financeTools } = await import('./finance.js');

const transactions = mockPillarFinance.finance.transactions;
const budgets = mockPillarFinance.finance.budgets;
const entities = mockPillarCore.core.entities;

beforeEach(() => {
  vi.clearAllMocks();
  transactions.list.mockResolvedValue(callOk({ data: [], pagination: { total: 0 } }));
  budgets.list.mockResolvedValue(callOk({ data: [], pagination: { total: 0 } }));
  entities.list.mockResolvedValue(callOk({ data: [], pagination: { total: 0 } }));
});

describe('finance.transactions.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.transactions.list')!;

  it('passes date filters through', async () => {
    await tool.handler({ startDate: '2025-01-01', endDate: '2025-12-31', type: 'expense' });
    expect(transactions.list).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2025-01-01', endDate: '2025-12-31', type: 'expense' })
    );
  });

  it('ignores invalid type values', async () => {
    await tool.handler({ type: 'invalid' });
    const call = transactions.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['type']).toBeUndefined();
  });

  it('returns isError on unavailable', async () => {
    transactions.list.mockResolvedValueOnce(callUnavailable('finance'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    transactions.list.mockResolvedValueOnce(callContractMismatch('finance', '1.0.0', '2.0.0'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('finance.entities.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.entities.list')!;

  it('calls core.entities.list with search filter', async () => {
    await tool.handler({ search: 'woolworths' });
    expect(entities.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'woolworths' }));
  });

  it('ignores unknown entity type values', async () => {
    await tool.handler({ type: 'alien' });
    const call = entities.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['type']).toBeUndefined();
  });

  it('passes valid entity type values', async () => {
    await tool.handler({ type: 'company' });
    const call = entities.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['type']).toBe('company');
  });
});

describe('finance.budgets.list', () => {
  const tool = financeTools.find((t) => t.name === 'finance.budgets.list')!;

  it('passes period and active filters', async () => {
    await tool.handler({ period: 'monthly', active: 'true' });
    expect(budgets.list).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'monthly', active: 'true' })
    );
  });

  it('ignores invalid period values', async () => {
    await tool.handler({ period: 'weekly' });
    const call = budgets.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['period']).toBeUndefined();
  });

  it('returns isError on unavailable', async () => {
    budgets.list.mockResolvedValueOnce(callUnavailable('finance'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

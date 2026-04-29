import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Transaction, TransactionFormValues } from './types';

// ---------- mocks ----------

const mockListQuery = vi.fn();
const mockAvailableTagsQuery = vi.fn();
const mockEntitiesListQuery = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockInvalidate = vi.fn();
const mockSuggestTagsFetch = vi.fn();

vi.mock('@pops/api-client', () => ({
  trpc: {
    finance: {
      transactions: {
        list: { useQuery: (...args: unknown[]) => mockListQuery(...args) },
        availableTags: {
          useQuery: (...args: unknown[]) => mockAvailableTagsQuery(...args),
        },
        create: {
          useMutation: () => ({
            mutate: (...args: unknown[]) => mockCreateMutate(...args),
            isPending: false,
          }),
        },
        update: {
          useMutation: () => ({
            mutate: (...args: unknown[]) => mockUpdateMutate(...args),
            isPending: false,
          }),
        },
        delete: {
          useMutation: () => ({
            mutate: (...args: unknown[]) => mockDeleteMutate(...args),
            isPending: false,
          }),
        },
      },
    },
    core: {
      entities: {
        list: { useQuery: (...args: unknown[]) => mockEntitiesListQuery(...args) },
      },
    },
    useUtils: () => ({
      finance: {
        transactions: {
          list: { invalidate: mockInvalidate },
          availableTags: { invalidate: mockInvalidate },
          suggestTags: { fetch: (...args: unknown[]) => mockSuggestTagsFetch(...args) },
        },
      },
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { TransactionFormSchema } from './types';
// Import after mocks are registered.
import { buildTransactionPayload, useTransactionsPage } from './useTransactionsPage';

// ---------- helpers ----------

function makeValues(overrides: Partial<TransactionFormValues> = {}): TransactionFormValues {
  return {
    date: '2026-04-26',
    amount: '-87.45',
    description: 'Woolworths Metro',
    account: 'Credit Card',
    type: 'Expense',
    entityId: '',
    tags: [],
    notes: '',
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    date: '2026-02-10',
    amount: -87.45,
    description: 'Woolworths Metro',
    account: 'Credit Card',
    type: 'Expense',
    entityId: 'ent-1',
    entityName: 'Woolworths',
    location: 'Sydney CBD',
    country: 'Australia',
    relatedTransactionId: null,
    notes: 'Weekly shop',
    tags: ['Groceries'],
    lastEditedTime: '2026-02-10T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListQuery.mockReturnValue({
    data: { data: [], pagination: { total: 0 } },
    isLoading: false,
  });
  mockAvailableTagsQuery.mockReturnValue({ data: [] });
  mockEntitiesListQuery.mockReturnValue({
    data: {
      data: [
        { id: 'ent-1', name: 'Woolworths', type: 'company' },
        { id: 'ent-2', name: 'Coles', type: 'company' },
      ],
    },
  });
});

// ---------- TransactionFormSchema — amount validation ----------

describe('TransactionFormSchema — amount', () => {
  const baseValues = {
    date: '2026-04-26',
    description: 'Woolworths',
    account: 'Credit Card',
    type: 'Expense',
    entityId: '',
    tags: [],
    notes: '',
  };

  it('accepts a non-zero amount', () => {
    const result = TransactionFormSchema.safeParse({ ...baseValues, amount: '-12.50' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty amount with "Amount is required"', () => {
    const result = TransactionFormSchema.safeParse({ ...baseValues, amount: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find((i) => i.path[0] === 'amount')?.message;
      expect(msg).toBe('Amount is required');
    }
  });

  it('rejects "0" with "Amount must be non-zero"', () => {
    const result = TransactionFormSchema.safeParse({ ...baseValues, amount: '0' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find((i) => i.path[0] === 'amount')?.message;
      expect(msg).toBe('Amount must be non-zero');
    }
  });

  it('rejects "0.00" with "Amount must be non-zero"', () => {
    const result = TransactionFormSchema.safeParse({ ...baseValues, amount: '0.00' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find((i) => i.path[0] === 'amount')?.message;
      expect(msg).toBe('Amount must be non-zero');
    }
  });

  it('rejects a non-numeric string with "Amount must be a valid number"', () => {
    const result = TransactionFormSchema.safeParse({ ...baseValues, amount: 'abc' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find((i) => i.path[0] === 'amount')?.message;
      expect(msg).toBe('Amount must be a valid number');
    }
  });
});

// ---------- buildTransactionPayload ----------

describe('buildTransactionPayload', () => {
  it('coerces amount string to number', () => {
    const payload = buildTransactionPayload({
      values: makeValues({ amount: '-12.5' }),
      entityName: null,
    });
    expect(payload.amount).toBe(-12.5);
  });

  it('coerces empty entityId to null and clears entityName', () => {
    const payload = buildTransactionPayload({
      values: makeValues({ entityId: '' }),
      entityName: 'Woolworths',
    });
    expect(payload.entityId).toBeNull();
    expect(payload.entityName).toBeNull();
  });

  it('keeps entityId and includes entityName when provided', () => {
    const payload = buildTransactionPayload({
      values: makeValues({ entityId: 'ent-1' }),
      entityName: 'Woolworths',
    });
    expect(payload.entityId).toBe('ent-1');
    expect(payload.entityName).toBe('Woolworths');
  });

  it('coerces empty notes to null', () => {
    const payload = buildTransactionPayload({
      values: makeValues({ notes: '' }),
      entityName: null,
    });
    expect(payload.notes).toBeNull();
  });

  it('passes non-empty notes through unchanged', () => {
    const payload = buildTransactionPayload({
      values: makeValues({ notes: 'A note' }),
      entityName: null,
    });
    expect(payload.notes).toBe('A note');
  });

  it('preserves all required fields verbatim', () => {
    const payload = buildTransactionPayload({
      values: makeValues({
        date: '2026-04-26',
        description: 'Coles Local',
        account: 'Debit Card',
        type: 'Expense',
        amount: '-50',
        tags: ['Groceries'],
      }),
      entityName: null,
    });
    expect(payload).toEqual({
      date: '2026-04-26',
      description: 'Coles Local',
      account: 'Debit Card',
      type: 'Expense',
      amount: -50,
      tags: ['Groceries'],
      entityId: null,
      entityName: null,
      notes: null,
    });
  });
});

// ---------- create path ----------

describe('useTransactionsPage — onSubmit (create)', () => {
  it('builds a payload with parsed amount and null entity for new transactions', () => {
    const { result } = renderHook(() => useTransactionsPage());

    act(() => {
      result.current.onSubmit(makeValues({ amount: '-87.45', notes: '' }));
    });

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: -87.45,
        entityId: null,
        entityName: null,
        notes: null,
      })
    );
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it('resolves entity name from the entities list when entityId is set', () => {
    const { result } = renderHook(() => useTransactionsPage());

    act(() => {
      result.current.onSubmit(makeValues({ entityId: 'ent-1' }));
    });

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'ent-1', entityName: 'Woolworths' })
    );
  });

  it('falls back to null entityName when entityId is not in the entities list', () => {
    const { result } = renderHook(() => useTransactionsPage());

    act(() => {
      result.current.onSubmit(makeValues({ entityId: 'ent-unknown' }));
    });

    // entityId is preserved; entityName resolves to null because the id is not
    // in the loaded entities cache.
    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'ent-unknown', entityName: null })
    );
  });

  it('preserves tags as-is on create', () => {
    const { result } = renderHook(() => useTransactionsPage());

    act(() => {
      result.current.onSubmit(makeValues({ tags: ['A', 'B'] }));
    });

    expect(mockCreateMutate).toHaveBeenCalledWith(expect.objectContaining({ tags: ['A', 'B'] }));
  });
});

// ---------- update path ----------

describe('useTransactionsPage — onSubmit (update)', () => {
  it('routes to update when an item is being edited', () => {
    const { result } = renderHook(() => useTransactionsPage());

    act(() => {
      result.current.handleEdit(makeTransaction({ id: 'txn-42' }));
    });
    act(() => {
      result.current.onSubmit(
        makeValues({ amount: '-99.99', entityId: 'ent-2', notes: 'Updated notes' })
      );
    });

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: 'txn-42',
      data: expect.objectContaining({
        amount: -99.99,
        entityId: 'ent-2',
        entityName: 'Coles',
        notes: 'Updated notes',
      }),
    });
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it('clears entityName when entityId is cleared on update', () => {
    const { result } = renderHook(() => useTransactionsPage());

    act(() => {
      result.current.handleEdit(makeTransaction({ id: 'txn-42', entityId: 'ent-1' }));
    });
    act(() => {
      result.current.onSubmit(makeValues({ entityId: '' }));
    });

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: 'txn-42',
      data: expect.objectContaining({ entityId: null, entityName: null }),
    });
  });
});

// ---------- form prefill ----------

describe('useTransactionsPage — handleEdit prefill', () => {
  it('resets form to the transaction values, including entity id', () => {
    const { result } = renderHook(() => useTransactionsPage());

    act(() => {
      result.current.handleEdit(
        makeTransaction({ id: 'txn-42', amount: -123.45, entityId: 'ent-1' })
      );
    });

    expect(result.current.form.getValues()).toEqual({
      date: '2026-02-10',
      amount: '-123.45',
      description: 'Woolworths Metro',
      account: 'Credit Card',
      type: 'Expense',
      entityId: 'ent-1',
      tags: ['Groceries'],
      notes: 'Weekly shop',
    });
    expect(result.current.editingTransaction?.id).toBe('txn-42');
  });

  it('treats null notes/entity as empty strings on form prefill', () => {
    const { result } = renderHook(() => useTransactionsPage());

    act(() => {
      result.current.handleEdit(makeTransaction({ id: 'txn-42', entityId: null, notes: null }));
    });

    const values = result.current.form.getValues();
    expect(values.entityId).toBe('');
    expect(values.notes).toBe('');
  });

  it('falls back to "Expense" when transaction.type is empty', () => {
    const { result } = renderHook(() => useTransactionsPage());

    act(() => {
      result.current.handleEdit(makeTransaction({ id: 'txn-42', type: '' }));
    });

    expect(result.current.form.getValues().type).toBe('Expense');
  });
});

// ---------- delete path ----------

describe('useTransactionsPage — delete', () => {
  it('exposes a setDeletingId setter that does not auto-fire the delete mutation', () => {
    const { result } = renderHook(() => useTransactionsPage());

    act(() => {
      result.current.setDeletingId('txn-42');
    });

    expect(result.current.deletingId).toBe('txn-42');
    // The delete only fires when the AlertDialog confirm button calls
    // deleteMutation.mutate explicitly — not when an id is staged.
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });
});

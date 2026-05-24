import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import { BudgetExceededError, ConflictError, NotFoundError, ValidationError } from './errors.js';
import { mapDomainErrors, mapDomainErrorsAsync } from './trpc-error-mapper.js';

function captureThrow(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to throw, but it returned normally');
}

async function captureReject(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to reject, but it resolved');
}

describe('mapDomainErrors', () => {
  it('returns the inner value when no throw', () => {
    expect(mapDomainErrors(() => 42)).toBe(42);
  });

  it('maps NotFoundError → NOT_FOUND', () => {
    const caught = captureThrow(() =>
      mapDomainErrors(() => {
        throw new NotFoundError('Fixture', 'x');
      })
    );
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe('NOT_FOUND');
    expect((caught as TRPCError).message).toBe("Fixture 'x' not found");
  });

  it('maps ConflictError → CONFLICT', () => {
    const caught = captureThrow(() =>
      mapDomainErrors(() => {
        throw new ConflictError('dup');
      })
    );
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe('CONFLICT');
  });

  it('maps ValidationError → BAD_REQUEST', () => {
    const caught = captureThrow(() =>
      mapDomainErrors(() => {
        throw new ValidationError({ field: 'name' });
      })
    );
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe('BAD_REQUEST');
  });

  it('maps BudgetExceededError → PAYMENT_REQUIRED', () => {
    const caught = captureThrow(() =>
      mapDomainErrors(() => {
        throw new BudgetExceededError({
          budgetId: 'b',
          limitType: 'cost',
          currentUsage: 10,
          limit: 5,
        });
      })
    );
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe('PAYMENT_REQUIRED');
  });

  it('rethrows non-HttpError unchanged', () => {
    const sentinel = new Error('boom');
    expect(() =>
      mapDomainErrors(() => {
        throw sentinel;
      })
    ).toThrow(sentinel);
  });
});

describe('mapDomainErrorsAsync', () => {
  it('returns the resolved value', async () => {
    await expect(mapDomainErrorsAsync(async () => 'ok')).resolves.toBe('ok');
  });

  it('maps an async-thrown NotFoundError', async () => {
    const caught = await captureReject(() =>
      mapDomainErrorsAsync(async () => {
        throw new NotFoundError('Fixture', 'x');
      })
    );
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe('NOT_FOUND');
  });

  it('rethrows a non-HttpError unchanged', async () => {
    const sentinel = new Error('boom');
    await expect(
      mapDomainErrorsAsync(async () => {
        throw sentinel;
      })
    ).rejects.toBe(sentinel);
  });
});

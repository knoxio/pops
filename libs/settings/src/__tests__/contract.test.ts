import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { makeSettingsContract } from '../contract.js';

const errors = { 401: z.object({ message: z.string() }) };

describe('makeSettingsContract', () => {
  const contract = makeSettingsContract(['theme', 'finance.model'], errors);

  it('exposes exactly the RU+reset (+internal ensure) verbs and no others', () => {
    expect(Object.keys(contract).toSorted()).toEqual(
      ['ensure', 'get', 'getMany', 'list', 'reset', 'resetKey', 'set', 'setMany'].toSorted()
    );
  });

  it('exposes no create or delete verb', () => {
    expect(contract).not.toHaveProperty('create');
    expect(contract).not.toHaveProperty('delete');
  });

  it('maps verbs to the federated wire methods and paths', () => {
    expect(contract.list).toMatchObject({ method: 'GET', path: '/settings' });
    expect(contract.get).toMatchObject({ method: 'GET', path: '/settings/:key' });
    expect(contract.getMany).toMatchObject({ method: 'POST', path: '/settings/get-many' });
    expect(contract.set).toMatchObject({ method: 'PUT', path: '/settings/:key' });
    expect(contract.setMany).toMatchObject({ method: 'POST', path: '/settings/set-many' });
    expect(contract.resetKey).toMatchObject({ method: 'POST', path: '/settings/:key/reset' });
    expect(contract.reset).toMatchObject({ method: 'POST', path: '/settings/reset' });
    expect(contract.ensure).toMatchObject({ method: 'POST', path: '/settings/:key/ensure' });
  });

  it('constrains single-key routes to the declared key enum', () => {
    expect(contract.get.pathParams.safeParse({ key: 'theme' }).success).toBe(true);
    expect(contract.get.pathParams.safeParse({ key: 'not-declared' }).success).toBe(false);
    expect(contract.set.pathParams.safeParse({ key: 'finance.model' }).success).toBe(true);
    expect(contract.set.pathParams.safeParse({ key: 'finance.unknown' }).success).toBe(false);
  });

  it('accepts free-form keys on the batch routes', () => {
    expect(contract.getMany.body.safeParse({ keys: ['anything', 'goes'] }).success).toBe(true);
    expect(contract.setMany.body.safeParse({ entries: [{ key: 'x', value: 'y' }] }).success).toBe(
      true
    );
  });

  it('threads the injected error responses onto every route', () => {
    expect(contract.get.responses).toHaveProperty('401');
    expect(contract.reset.responses).toHaveProperty('401');
  });
});

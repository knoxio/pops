import { describe, expect, it } from 'vitest';

import { buildRouteMap, type OpenApiDocument } from '../openapi-route-map.js';
import { performRestCall, type RestCallContext } from '../rest-call.js';
import { discoveredPillar, fakeFetch, type FakeFetchHandler } from './fixtures.js';

const OPENAPI: OpenApiDocument = {
  paths: {
    '/entities/{id}': {
      get: { operationId: 'entities.get', parameters: [{ name: 'id', in: 'path' }] },
      patch: {
        operationId: 'entities.update',
        parameters: [{ name: 'id', in: 'path' }],
        requestBody: {},
      },
    },
    '/users': {
      get: { operationId: 'users.get', parameters: [{ name: 'uri', in: 'query' }] },
    },
    '/entities': {
      get: {
        operationId: 'entities.list',
        parameters: [
          { name: 'type', in: 'query' },
          { name: 'tags', in: 'query' },
        ],
      },
    },
    '/settings/get-many': {
      post: { operationId: 'settings.getMany', requestBody: {} },
    },
  },
};

type Recorded = {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
};

function recordingRest(responder: (rec: Recorded) => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const handler: FakeFetchHandler = async (url, init) => {
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers;
    if (rawHeaders && typeof rawHeaders === 'object' && !Array.isArray(rawHeaders)) {
      for (const [k, v] of Object.entries(rawHeaders)) headers[k] = String(v);
    }
    let body: unknown;
    if (typeof init?.body === 'string') {
      body = init.body.length > 0 ? JSON.parse(init.body) : undefined;
    }
    const rec: Recorded = { url, method: init?.method ?? 'GET', body, headers };
    calls.push(rec);
    return responder(rec);
  };
  return { fetchImpl: fakeFetch(handler), calls };
}

function ctx(
  path: readonly string[],
  input: unknown,
  fetchImpl: typeof fetch,
  overrides: Partial<RestCallContext> = {}
): RestCallContext {
  return {
    pillarId: 'registry',
    discovered: discoveredPillar({ pillarId: 'registry', baseUrl: 'http://registry-api:3001' }),
    path,
    input,
    routes: OPENAPI,
    fetchImpl,
    ...overrides,
  };
}

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('performRestCall — request building', () => {
  it('substitutes a path param into the template and sends no body for a GET', async () => {
    const { fetchImpl, calls } = recordingRest(() => jsonOk({ data: { id: 'ent-1' } }));
    const result = await performRestCall(ctx(['entities', 'get'], { id: 'ent-1' }, fetchImpl));

    expect(result).toEqual({ kind: 'ok', value: { data: { id: 'ent-1' } } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://registry-api:3001/entities/ent-1');
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.body).toBeUndefined();
  });

  it('url-encodes path param values', async () => {
    const { fetchImpl, calls } = recordingRest(() => jsonOk({ data: null }));
    await performRestCall(ctx(['entities', 'get'], { id: 'a/b c' }, fetchImpl));
    expect(calls[0]?.url).toBe('http://registry-api:3001/entities/a%2Fb%20c');
  });

  it('appends query params from input and omits null/undefined', async () => {
    const { fetchImpl, calls } = recordingRest(() => jsonOk({ data: null }));
    await performRestCall(ctx(['users', 'get'], { uri: 'urn:x:1' }, fetchImpl));
    expect(calls[0]?.url).toBe('http://registry-api:3001/users?uri=urn%3Ax%3A1');
    expect(calls[0]?.method).toBe('GET');
  });

  it('serialises array query params as repeated entries', async () => {
    const { fetchImpl, calls } = recordingRest(() => jsonOk({ data: null }));
    await performRestCall(
      ctx(['entities', 'list'], { type: 'company', tags: ['a', 'b'] }, fetchImpl)
    );
    expect(calls[0]?.url).toBe('http://registry-api:3001/entities?type=company&tags=a&tags=b');
  });

  it('sends the full input as the JSON body for a bodyless-param POST', async () => {
    const { fetchImpl, calls } = recordingRest(() => jsonOk({ values: [] }));
    await performRestCall(ctx(['settings', 'getMany'], { keys: ['a', 'b'] }, fetchImpl));
    expect(calls[0]?.url).toBe('http://registry-api:3001/settings/get-many');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body).toEqual({ keys: ['a', 'b'] });
  });

  it('strips path params from the body on a mixed PATCH', async () => {
    const { fetchImpl, calls } = recordingRest(() => jsonOk({ data: { id: 'ent-1' } }));
    await performRestCall(ctx(['entities', 'update'], { id: 'ent-1', name: 'Renamed' }, fetchImpl));
    expect(calls[0]?.url).toBe('http://registry-api:3001/entities/ent-1');
    expect(calls[0]?.method).toBe('PATCH');
    expect(calls[0]?.body).toEqual({ name: 'Renamed' });
  });

  it('strips a trailing slash from baseUrl before mounting the path', async () => {
    const { fetchImpl, calls } = recordingRest(() => jsonOk({ data: null }));
    await performRestCall(
      ctx(['entities', 'get'], { id: 'ent-1' }, fetchImpl, {
        discovered: discoveredPillar({
          pillarId: 'registry',
          baseUrl: 'http://registry-api:3001/',
        }),
      })
    );
    expect(calls[0]?.url).toBe('http://registry-api:3001/entities/ent-1');
  });

  it('accepts a pre-built RouteMap as the route source', async () => {
    const { fetchImpl, calls } = recordingRest(() => jsonOk({ data: null }));
    await performRestCall(
      ctx(['entities', 'get'], { id: 'ent-1' }, fetchImpl, { routes: buildRouteMap(OPENAPI) })
    );
    expect(calls[0]?.url).toBe('http://registry-api:3001/entities/ent-1');
  });

  it('merges authHeaders over the default content-type / accept headers', async () => {
    const { fetchImpl, calls } = recordingRest(() => jsonOk({ data: null }));
    await performRestCall(
      ctx(['entities', 'get'], { id: 'ent-1' }, fetchImpl, {
        authHeaders: () => ({ authorization: 'Bearer t' }),
      })
    );
    expect(calls[0]?.headers['authorization']).toBe('Bearer t');
    expect(calls[0]?.headers['content-type']).toBe('application/json');
  });
});

describe('performRestCall — response / error mapping', () => {
  it('decodes a plain-JSON success body directly (no tRPC envelope unwrap)', async () => {
    const { fetchImpl } = recordingRest(() => jsonOk({ data: [{ id: 'x' }] }));
    const result = await performRestCall(ctx(['settings', 'getMany'], { keys: [] }, fetchImpl));
    expect(result).toEqual({ kind: 'ok', value: { data: [{ id: 'x' }] } });
  });

  it('maps 404 → not-found with the envelope message', async () => {
    const { fetchImpl } = recordingRest(() => jsonOk({ message: 'no such entity' }, 404));
    const result = await performRestCall(ctx(['entities', 'get'], { id: 'missing' }, fetchImpl));
    expect(result).toEqual({ kind: 'not-found', pillar: 'registry', message: 'no such entity' });
  });

  it('maps 400 → bad-request with the envelope message', async () => {
    const { fetchImpl } = recordingRest(() =>
      jsonOk({ message: 'bad keys', code: 'ValidationError' }, 400)
    );
    const result = await performRestCall(ctx(['settings', 'getMany'], {}, fetchImpl));
    expect(result).toEqual({ kind: 'bad-request', pillar: 'registry', message: 'bad keys' });
  });

  it('maps 409 → conflict', async () => {
    const { fetchImpl } = recordingRest(() => jsonOk({ message: 'already exists' }, 409));
    const result = await performRestCall(
      ctx(['entities', 'update'], { id: 'ent-1', name: 'x' }, fetchImpl)
    );
    expect(result).toEqual({ kind: 'conflict', pillar: 'registry', message: 'already exists' });
  });

  it('maps 401 → unauthorized with the envelope message', async () => {
    const { fetchImpl } = recordingRest(() => jsonOk({ message: 'denied' }, 401));
    const result = await performRestCall(ctx(['entities', 'get'], { id: 'ent-1' }, fetchImpl));
    expect(result).toEqual({ kind: 'unauthorized', pillar: 'registry', message: 'denied' });
  });

  it('maps 401 → unauthorized with no message when the body has none', async () => {
    const { fetchImpl } = recordingRest(() => jsonOk({}, 401));
    const result = await performRestCall(ctx(['entities', 'get'], { id: 'ent-1' }, fetchImpl));
    expect(result).toEqual({ kind: 'unauthorized', pillar: 'registry' });
  });

  it('maps an unmapped 5xx → unavailable', async () => {
    const { fetchImpl } = recordingRest(() => jsonOk({ message: 'boom' }, 503));
    const result = await performRestCall(ctx(['entities', 'get'], { id: 'ent-1' }, fetchImpl));
    expect(result).toEqual({ kind: 'unavailable', pillar: 'registry' });
  });

  it('returns unavailable when fetch rejects (network/abort)', async () => {
    const fetchImpl = fakeFetch(() => {
      throw new Error('network down');
    });
    const result = await performRestCall(ctx(['entities', 'get'], { id: 'ent-1' }, fetchImpl));
    expect(result).toEqual({ kind: 'unavailable', pillar: 'registry' });
  });

  it('returns contract-mismatch when the operationId is not in the route map', async () => {
    const { fetchImpl, calls } = recordingRest(() => jsonOk({}));
    const result = await performRestCall(ctx(['entities', 'doesNotExist'], {}, fetchImpl));
    expect(result).toEqual({
      kind: 'contract-mismatch',
      pillar: 'registry',
      expected: 'entities.doesNotExist',
    });
    expect(calls).toHaveLength(0);
  });

  it('returns unavailable when a 2xx body is not valid JSON', async () => {
    const fetchImpl = fakeFetch(() => new Response('not json', { status: 200 }));
    const result = await performRestCall(ctx(['entities', 'get'], { id: 'ent-1' }, fetchImpl));
    expect(result).toEqual({ kind: 'unavailable', pillar: 'registry' });
  });
});

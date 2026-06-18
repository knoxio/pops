import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildRouteMap, type OpenApiDocument } from '../openapi-route-map.js';

const CORE_OPENAPI_PATH = fileURLToPath(
  new URL('../../../../../pillars/core/openapi/core.openapi.json', import.meta.url)
);

function loadCoreOpenApi(): OpenApiDocument {
  const raw = readFileSync(CORE_OPENAPI_PATH, 'utf8');
  return JSON.parse(raw) as OpenApiDocument;
}

describe('buildRouteMap — against the real core OpenAPI document', () => {
  const map = buildRouteMap(loadCoreOpenApi());

  it("keys operations by operationId '<domain>.<proc>' (no pillarId prefix)", () => {
    expect(map.has('entities.get')).toBe(true);
    expect(map.has('core.entities.get')).toBe(false);
  });

  it('maps a path-param GET — entities.get → GET /entities/{id}', () => {
    expect(map.get('entities.get')).toEqual({
      method: 'GET',
      pathTemplate: '/entities/{id}',
      pathParams: ['id'],
      queryParams: [],
      hasBody: false,
    });
  });

  it('maps a body POST — settings.getMany → POST /settings/get-many with body', () => {
    expect(map.get('settings.getMany')).toEqual({
      method: 'POST',
      pathTemplate: '/settings/get-many',
      pathParams: [],
      queryParams: [],
      hasBody: true,
    });
  });

  it('maps a query GET — users.get → GET /users with query uri', () => {
    expect(map.get('users.get')).toEqual({
      method: 'GET',
      pathTemplate: '/users',
      pathParams: [],
      queryParams: ['uri'],
      hasBody: false,
    });
  });

  it('maps a mixed PATCH — entities.update → PATCH /entities/{id} with path param AND body', () => {
    expect(map.get('entities.update')).toEqual({
      method: 'PATCH',
      pathTemplate: '/entities/{id}',
      pathParams: ['id'],
      queryParams: [],
      hasBody: true,
    });
  });

  it('captures every query parameter in declaration order', () => {
    expect(map.get('entities.list')).toEqual({
      method: 'GET',
      pathTemplate: '/entities',
      pathParams: [],
      queryParams: ['search', 'type', 'limit', 'offset'],
      hasBody: false,
    });
  });

  it('treats a DELETE with an optional body as hasBody (requestBody present)', () => {
    const route = map.get('entities.delete');
    expect(route?.method).toBe('DELETE');
    expect(route?.pathParams).toEqual(['id']);
  });
});

describe('buildRouteMap — structural edge cases', () => {
  it('returns an empty map when paths is absent or malformed', () => {
    expect(buildRouteMap({}).size).toBe(0);
    const malformed = { paths: undefined } satisfies OpenApiDocument;
    expect(buildRouteMap(malformed).size).toBe(0);
  });

  it('skips operations without an operationId', () => {
    const doc: OpenApiDocument = {
      paths: {
        '/thing': { get: { parameters: [{ name: 'q', in: 'query' }] } },
      },
    };
    expect(buildRouteMap(doc).size).toBe(0);
  });

  it('ignores non-method keys on a path item (e.g. parameters, summary)', () => {
    const doc: OpenApiDocument = {
      paths: {
        '/thing/{id}': {
          get: { operationId: 'thing.get', parameters: [{ name: 'id', in: 'path' }] },
        },
      },
    };
    const map = buildRouteMap(doc);
    expect(map.size).toBe(1);
    expect(map.get('thing.get')?.pathParams).toEqual(['id']);
  });

  it('keeps the first operation when two collide on the same operationId', () => {
    const doc: OpenApiDocument = {
      paths: {
        '/a': { get: { operationId: 'dup.op' } },
        '/b': { post: { operationId: 'dup.op', requestBody: {} } },
      },
    };
    const map = buildRouteMap(doc);
    expect(map.get('dup.op')).toEqual({
      method: 'GET',
      pathTemplate: '/a',
      pathParams: [],
      queryParams: [],
      hasBody: false,
    });
  });

  it('classifies header / cookie params as neither path nor query', () => {
    const doc: OpenApiDocument = {
      paths: {
        '/h': {
          get: {
            operationId: 'h.get',
            parameters: [
              { name: 'x-trace', in: 'header' },
              { name: 'q', in: 'query' },
            ],
          },
        },
      },
    };
    expect(buildRouteMap(doc).get('h.get')).toEqual({
      method: 'GET',
      pathTemplate: '/h',
      pathParams: [],
      queryParams: ['q'],
      hasBody: false,
    });
  });
});

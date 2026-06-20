/**
 * OpenAPI-operationId-driven REST route map.
 *
 * The server-side pillar SDK addresses another pillar's procedures by a
 * `[domain, proc]` path. The collapsed pillars now serve idiomatic ts-rest at
 * root with `operationId === '<domain>.<proc>'` (their OpenAPI is generated
 * with `setOperationId: 'concatenated-path'`). This module turns a pillar's
 * OpenAPI 3.x document into a lookup keyed by that operationId, so a call can
 * be resolved to a concrete HTTP request (method + path template + parameter
 * locations) without hardcoding any per-pillar routing.
 *
 * Pure and synchronous. No network, no `as any`.
 */

/** The HTTP methods OpenAPI path-item objects may carry. */
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;

type OpenApiMethod = (typeof HTTP_METHODS)[number];

/**
 * A single resolved route: everything `performRestCall` needs to turn a
 * `[domain, proc]` call + `input` into an HTTP request.
 */
export interface RouteEntry {
  /** Upper-cased HTTP method, ready to hand to `fetch`. */
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH';
  /** The OpenAPI path template, e.g. `/entities/{id}`. */
  pathTemplate: string;
  /** Names of `in: 'path'` parameters, in declaration order. */
  pathParams: string[];
  /** Names of `in: 'query'` parameters, in declaration order. */
  queryParams: string[];
  /** Whether the operation declares a `requestBody`. */
  hasBody: boolean;
}

/** `operationId` → resolved route. */
export type RouteMap = ReadonlyMap<string, RouteEntry>;

/**
 * Minimal structural view of the slice of an OpenAPI 3.x document this module
 * reads. Kept local (rather than pulling a full openapi-types dependency) so
 * the SDK stays dependency-light; only the fields actually consumed are typed.
 */
export interface OpenApiDocument {
  paths?: Record<string, OpenApiPathItem | undefined>;
}

type OpenApiPathItem = {
  [method in OpenApiMethod]?: OpenApiOperation;
};

interface OpenApiOperation {
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: unknown;
}

interface OpenApiParameter {
  name?: string;
  in?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOpenApiMethod(key: string): key is OpenApiMethod {
  return (HTTP_METHODS as readonly string[]).includes(key);
}

function toUpperMethod(method: OpenApiMethod): RouteEntry['method'] {
  switch (method) {
    case 'get':
      return 'GET';
    case 'put':
      return 'PUT';
    case 'post':
      return 'POST';
    case 'delete':
      return 'DELETE';
    case 'patch':
      return 'PATCH';
  }
}

function classifyParameters(parameters: unknown): {
  pathParams: string[];
  queryParams: string[];
} {
  const pathParams: string[] = [];
  const queryParams: string[] = [];
  if (!Array.isArray(parameters)) return { pathParams, queryParams };
  for (const param of parameters) {
    if (!isRecord(param)) continue;
    const name = param['name'];
    const location = param['in'];
    if (typeof name !== 'string' || typeof location !== 'string') continue;
    if (location === 'path') pathParams.push(name);
    else if (location === 'query') queryParams.push(name);
  }
  return { pathParams, queryParams };
}

/**
 * Build the `operationId → RouteEntry` map from an OpenAPI 3.x document.
 *
 * Operations without an `operationId` are skipped (they cannot be addressed by
 * the SDK's `[domain, proc]` lookup). If two operations collide on the same
 * `operationId`, the first one encountered wins — a well-formed document
 * generated with `concatenated-path` will not collide.
 */
export function buildRouteMap(doc: OpenApiDocument): RouteMap {
  const map = new Map<string, RouteEntry>();
  const paths = doc.paths;
  if (!isRecord(paths)) return map;

  for (const [pathTemplate, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue;
    for (const [methodKey, operation] of Object.entries(pathItem)) {
      if (!isOpenApiMethod(methodKey) || !isRecord(operation)) continue;
      const operationId = operation['operationId'];
      if (typeof operationId !== 'string' || operationId.length === 0) continue;
      if (map.has(operationId)) continue;

      const { pathParams, queryParams } = classifyParameters(operation['parameters']);
      map.set(operationId, {
        method: toUpperMethod(methodKey),
        pathTemplate,
        pathParams,
        queryParams,
        hasBody: operation['requestBody'] !== undefined,
      });
    }
  }

  return map;
}

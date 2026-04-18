/**
 * OpenAPI spec validation script (US-04).
 *
 * Validates that all annotated procedures have required fields and that there
 * are no duplicate method+path combinations. Run via `mise openapi:validate`.
 *
 * Exit codes:
 *   0 — spec is valid
 *   1 — validation failed (see output)
 */
import { generateOpenApiDocument } from 'trpc-to-openapi';

import { appRouter } from '../src/router.js';

const doc = generateOpenApiDocument(appRouter, {
  title: 'POPS API',
  description: 'Personal Operations System — REST secondary contract',
  version: '1.0.0',
  openApiVersion: '3.1.0',
  baseUrl: '/api/v1',
});

let errors = 0;

const seen = new Set<string>();

for (const [path, methods] of Object.entries(doc.paths ?? {})) {
  for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    const op = operation as { summary?: string; operationId?: string };

    // Each annotated procedure must have a summary
    if (!op.summary) {
      console.error(`[ERROR] Missing summary: ${method.toUpperCase()} ${path}`);
      errors++;
    }

    // No duplicate method+path combinations
    const key = `${method.toUpperCase()} ${path}`;
    if (seen.has(key)) {
      console.error(`[ERROR] Duplicate route: ${key}`);
      errors++;
    }
    seen.add(key);
  }
}

if (errors > 0) {
  console.error(`\nOpenAPI validation failed with ${errors} error(s).`);
  process.exit(1);
}

const routeCount = seen.size;
console.log(`OpenAPI spec valid — ${routeCount} route(s) checked.`);

/**
 * OpenAPI spec validation script (US-04).
 *
 * Generates the OpenAPI document from the annotated tRPC router and checks
 * that it has a non-empty paths object and that every annotated operation has
 * a summary. Run via `mise openapi:validate`.
 *
 * Note: response schemas are currently `{}` (z.any()) — trpc-to-openapi emits
 * no specific schema for outputs typed with openApiOutput<T>(). Schema-level
 * validation via swagger-parser is tracked as a follow-up.
 *
 * Exit codes:
 *   0 — spec is valid
 *   1 — validation failed (see output)
 */
import { generateOpenApiDocument } from 'trpc-to-openapi';

import { appRouter } from '../src/router.js';

async function main(): Promise<void> {
  const doc = generateOpenApiDocument(appRouter, {
    title: 'POPS API',
    description: 'Personal Operations System — REST secondary contract',
    version: '1.0.0',
    openApiVersion: '3.1.0',
    baseUrl: '/api/v1',
  });

  const paths = doc.paths;

  if (!paths || Object.keys(paths).length === 0) {
    console.error('[ERROR] OpenAPI validation failed: generated document has no paths.');
    process.exit(1);
  }

  let errors = 0;
  let routeCount = 0;

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const op = operation as { summary?: string };
      routeCount++;

      if (!op.summary) {
        console.error(`[ERROR] Missing summary: ${method.toUpperCase()} ${path}`);
        errors++;
      }
    }
  }

  if (routeCount === 0) {
    console.error('[ERROR] OpenAPI validation failed: generated document has no operations.');
    process.exit(1);
  }

  if (errors > 0) {
    console.error(`\nOpenAPI validation failed with ${errors} error(s).`);
    process.exit(1);
  }

  console.log(`OpenAPI spec valid — ${routeCount} route(s) checked.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ERROR] OpenAPI validation failed: ${message}`);
  process.exit(1);
});

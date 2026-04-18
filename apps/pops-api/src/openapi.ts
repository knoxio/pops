import { generateOpenApiDocument } from 'trpc-to-openapi';

import { appRouter } from './router.js';

/**
 * OpenAPI 3.1 specification generated from annotated tRPC procedures.
 * Served at GET /api/openapi.json and used by Swagger UI at GET /api/docs.
 * tRPC remains the primary interface for the React frontend.
 */
export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'POPS API',
  description: 'Personal Operations System — REST secondary contract (tRPC is primary)',
  version: '1.0.0',
  openApiVersion: '3.1.0',
  baseUrl: '/api/v1',
  tags: [
    'entities',
    'jobs',
    'search',
    'settings',
    'transactions',
    'budgets',
    'movies',
    'tv-shows',
    'watch-history',
    'watchlist',
    'inventory-items',
    'locations',
    'connections',
  ],
});

export * from './manifest-schema/index.js';
export * from './bootstrap/index.js';
export * from './discovery/index.js';
export * from './capabilities/index.js';
export * from './ranking/index.js';
// NOTE: contracts/ is intentionally NOT re-exported from the root barrel.
// Re-exporting it would put @pops/finance-contract on the root index.d.ts
// import graph, forcing every TS consumer (including non-React / non-Node
// callers that only want manifest-schema or bootstrap) to resolve the
// finance contract package. Callers that want the convenience helper
// import explicitly: `from '@pops/pillar-sdk/contracts'`.

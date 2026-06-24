/**
 * Public barrel for `@pops/cerebrum`. This is the default export of the
 * pillar — consumers `import { ... } from '@pops/cerebrum'` and get the
 * wire-contract surface (zod schemas, TS wire types, error codes, and the
 * `CerebrumContract` manifest type).
 *
 * Nothing here is server-side: no drizzle, no db row types, no `src/db`/`src/api`
 * internals. The boundary is enforced by the package's `exports` map — only `.`,
 * `./manifest`, `./api-types`, and `./openapi` resolve from outside. Polyglot + FE
 * consumers read the wire shape from `./openapi` / `./api-types`; TS consumers
 * import the zod wire types here.
 */
export * from './types/index.js';
export * from './schemas/index.js';
export * from './errors.js';
export type { CerebrumContract } from './manifest.js';

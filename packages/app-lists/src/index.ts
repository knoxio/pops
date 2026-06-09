/**
 * @pops/app-lists — frontend entrypoint.
 *
 * Exposes the module manifest, navConfig, and route table consumed by the
 * shell. Server-only surface (schema + service layer from PRD-112) lives at
 * `@pops/app-lists/db` so the browser bundle stays free of better-sqlite3 /
 * drizzle. Mirrors `@pops/app-food` (frontend) + `@pops/app-food-db`
 * (server-only sibling) — single-package equivalent using a subpath export.
 */
export { manifest } from './manifest';
export { navConfig, routes } from './routes';

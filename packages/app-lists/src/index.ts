/**
 * @pops/app-lists — frontend entrypoint.
 *
 * Exposes the module manifest, navConfig, and route table consumed by the
 * shell. Server-only surface (schema + service layer from PRD-112) lives at
 * `@pops/app-lists/db` so the browser bundle stays free of better-sqlite3 /
 * drizzle. Mirrors the split convention used by `@pops/app-food`.
 */
export { manifest } from './manifest';
export { navConfig, routes } from './routes';

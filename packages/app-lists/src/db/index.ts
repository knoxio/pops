/**
 * @pops/app-lists/db — backward-compat shim for the server-only persistence
 * layer that now lives in `@pops/app-lists-db`.
 *
 * The split mirrors `@pops/app-food` / `@pops/app-food-db`: backend
 * consumers (pops-api, food seed) get a Node-built package without React or
 * the frontend manifest dragged into their bundle. The shim keeps the
 * `@pops/app-lists/db` subpath alive for the existing app-food-db seed
 * imports until they migrate to the new package directly.
 */
export * from '@pops/app-lists-db';

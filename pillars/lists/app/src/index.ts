/**
 * @pops/app-lists — frontend entrypoint.
 *
 * Exposes the module manifest, navConfig, and route table consumed by the
 * shell. Talks to the lists pillar over its REST contract via the generated
 * client in `./lists-api`.
 */
export { manifest } from './manifest';
export { navConfig, routes } from './routes';

/**
 * Resolve the registry base URL from the environment for the nginx
 * render + watcher paths.
 *
 * `POPS_REGISTRY_URL` is the repo-wide convention (orchestrator, mcp,
 * the SDK bootstrap, and the shell's self-registration all read it), so
 * it wins. `CORE_REGISTRY_URL` is kept as a deprecated legacy fallback for
 * the existing watcher test harness and any compose file that still sets the
 * older name; remove it once nothing references it. The default host below
 * is `registry-api` (the pillar formerly named `core`).
 */
export const DEFAULT_REGISTRY_URL = 'http://registry-api:3001';

export function resolveRegistryUrl(env: NodeJS.ProcessEnv): string {
  const pops = env['POPS_REGISTRY_URL'];
  if (pops !== undefined && pops.length > 0) return pops;
  const core = env['CORE_REGISTRY_URL'];
  if (core !== undefined && core.length > 0) return core;
  return DEFAULT_REGISTRY_URL;
}

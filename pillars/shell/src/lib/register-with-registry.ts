/**
 * Shell self-registration with the `registry` pillar
 * (docs/themes/federation/prds/registry-driven-shell-ui + ADR-035 UI-pillar variant).
 *
 * The shell is the first **UI pillar** to register itself: a pillar that
 * owns no data, exposes no procedures, and ships an empty manifest
 * (no `routes`, no `search` adapters, no `ai` tools, no `sinks`, no
 * `uri` types, no `settings`). It still registers so the federation
 * has a single, dynamic list of every running surface — UI included —
 * which downstream tooling (status pages, ops dashboards, MCP tool
 * inspection) can consume without baking shell URLs into env files
 * for every consumer.
 *
 * Trust model — registration uses the shared `POPS_INTERNAL_API_KEY`
 * (ADR-027 docker-network boundary). The shell does NOT register from
 * the browser; the API key never reaches the client bundle. The
 * `scripts/register-with-registry.ts` CLI runs this from a Node
 * container entrypoint (or an ops console) with the key sourced from
 * the same secret store every other pillar uses.
 *
 * Failure policy — registration is a *best-effort* boot step. If the
 * registry is unreachable, slow, or returns an error, the shell still
 * boots: a UI pillar that fails to announce itself is degraded, not
 * broken. Missing env vars short-circuit before the network call (the
 * same base-URL discipline the data pillars apply).
 */
import type { ManifestPayload } from '@pops/pillar-sdk';

export const SHELL_PILLAR_ID = 'shell' as const;
export const SHELL_PILLAR_VERSION = '0.1.0' as const;

/**
 * Sentinel contract triplet for the shell. ADR-035 carves UI pillars
 * out of the per-pillar contract-package discipline, but the registry
 * endpoint still requires the strings to match the
 * `@pops/<pillar>-contract` / `contract-<pillar>@v<semver>` shape so
 * the cross-field validator (`checkContractPackageMatchesPillar`)
 * succeeds. The package is a placeholder — it does not need to exist
 * in the workspace, only to be lexically consistent.
 */
export const SHELL_CONTRACT_PACKAGE = '@pops/shell-contract' as const;
export const SHELL_CONTRACT_TAG = `contract-${SHELL_PILLAR_ID}@v${SHELL_PILLAR_VERSION}` as const;

/**
 * The empty manifest a UI pillar publishes. Every capability array is
 * empty; healthcheck still points at `/health` because the registry's
 * heartbeat checker probes it. `sinks` is intentionally omitted — it is
 * optional in the manifest schema and a UI pillar neither emits nor
 * consumes federated events directly.
 */
export function buildShellManifest(): ManifestPayload {
  return {
    pillar: SHELL_PILLAR_ID,
    version: SHELL_PILLAR_VERSION,
    contract: {
      package: SHELL_CONTRACT_PACKAGE,
      version: SHELL_PILLAR_VERSION,
      tag: SHELL_CONTRACT_TAG,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}

export interface RegisterShellEnv {
  readonly registryBaseUrl: string | undefined;
  readonly shellBaseUrl: string | undefined;
  readonly internalApiKey: string | undefined;
}

export type RegisterShellOutcome =
  | {
      readonly kind: 'skipped';
      readonly reason: 'missing-env';
      readonly missing: readonly string[];
    }
  | { readonly kind: 'registered'; readonly pillarId: string; readonly registeredAt: string }
  | { readonly kind: 'failed'; readonly status: number; readonly body: unknown }
  | { readonly kind: 'unreachable'; readonly error: unknown };

export interface RegisterShellDeps {
  readonly env: RegisterShellEnv;
  /**
   * Transport seam. Defaults to global `fetch` so production code uses
   * the platform implementation; tests inject a stub that never touches
   * the network.
   */
  readonly fetch?: typeof fetch;
  /**
   * Optional logger seam. Defaults to `console`; tests pass a stub to
   * assert the unreachable-branch message without polluting stdout.
   */
  readonly logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

interface RegisterResponseBody {
  readonly ok: boolean;
  readonly pillarId?: string;
  readonly registeredAt?: string;
}

function collectMissingEnv(env: RegisterShellEnv): string[] {
  const missing: string[] = [];
  if (!env.registryBaseUrl) missing.push('POPS_REGISTRY_URL');
  if (!env.shellBaseUrl) missing.push('SHELL_BASE_URL');
  if (!env.internalApiKey) missing.push('POPS_INTERNAL_API_KEY');
  return missing;
}

function buildRegisterRequestBody(env: RegisterShellEnv): {
  pillarId: string;
  baseUrl: string;
  manifest: ManifestPayload;
  apiKey: string;
} {
  return {
    pillarId: SHELL_PILLAR_ID,
    baseUrl: env.shellBaseUrl ?? '',
    manifest: buildShellManifest(),
    apiKey: env.internalApiKey ?? '',
  };
}

async function interpretResponse(
  res: Response,
  logger: Pick<Console, 'info' | 'warn' | 'error'>
): Promise<RegisterShellOutcome> {
  if (!res.ok) {
    const payload: unknown = await safeReadJson(res);
    logger.warn(`[shell-registry] registry rejected registration: ${String(res.status)}`, payload);
    return { kind: 'failed', status: res.status, body: payload };
  }
  const parsed = (await res.json()) as RegisterResponseBody;
  const pillarId = parsed.pillarId ?? SHELL_PILLAR_ID;
  const registeredAt = parsed.registeredAt ?? new Date().toISOString();
  logger.info(`[shell-registry] registered as '${pillarId}' at ${registeredAt}`);
  return { kind: 'registered', pillarId, registeredAt };
}

/**
 * Run the shell's self-registration once. Resolves to a structured
 * outcome rather than throwing so a caller (boot script, test) can
 * react to every branch — including the silent skip — without
 * try/catch noise.
 */
export async function registerShellWithRegistry(
  deps: RegisterShellDeps
): Promise<RegisterShellOutcome> {
  const { env } = deps;
  const logger = deps.logger ?? console;

  const missing = collectMissingEnv(env);
  if (missing.length > 0) {
    logger.info(`[shell-registry] skipping registration — missing env: ${missing.join(', ')}`);
    return { kind: 'skipped', reason: 'missing-env', missing };
  }

  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const endpoint = joinUrl(env.registryBaseUrl ?? '', '/core.registry.register');

  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildRegisterRequestBody(env)),
    });
    return await interpretResponse(res, logger);
  } catch (error) {
    logger.warn('[shell-registry] registry unreachable — continuing boot', error);
    return { kind: 'unreachable', error };
  }
}

function joinUrl(base: string, path: string): string {
  if (base.endsWith('/') && path.startsWith('/')) return base + path.slice(1);
  if (!base.endsWith('/') && !path.startsWith('/')) return `${base}/${path}`;
  return base + path;
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

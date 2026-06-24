#!/usr/bin/env tsx
/**
 * Ops CLI: register the running shell with `pops-registry`'s pillar
 * registry (docs/themes/federation/prds/dynamic-pillar-registration +
 * ADR-035).
 *
 * The shell's production image is `nginx:alpine` — there is no Node
 * runtime at request time. This script is invoked from outside the
 * shell container (a deploy step, a Compose `oneshot` service, or
 * `mise run shell:register`) with the same secrets every other pillar
 * uses:
 *
 *     POPS_REGISTRY_URL     http://registry-api:3001
 *     SHELL_BASE_URL        https://pops.local
 *     POPS_INTERNAL_API_KEY <shared docker-network key>
 *
 * The script delegates to `registerShellWithRegistry` so the boot
 * behaviour is identical to whatever a future in-process caller would
 * see. Exit code is 0 for `registered` and `skipped` (silent skip is a
 * normal outcome for envs that do not yet have a registry), and 0 for
 * `unreachable`/`failed` too — registry hiccups MUST NOT block a
 * deploy. The structured outcome is printed to stdout so a wrapper can
 * decide otherwise.
 *
 * This is the same iOS / kiosk / future-UI-pillar pattern: copy the
 * script, swap the env var prefix, point at the same endpoint.
 */
import { registerShellWithRegistry } from '../src/lib/register-with-registry.ts';

async function main(): Promise<void> {
  const outcome = await registerShellWithRegistry({
    env: {
      registryBaseUrl: process.env.POPS_REGISTRY_URL,
      shellBaseUrl: process.env.SHELL_BASE_URL,
      internalApiKey: process.env.POPS_INTERNAL_API_KEY,
    },
  });

  process.stdout.write(`${JSON.stringify(outcome)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`[shell-registry] unexpected failure: ${String(error)}\n`);
  process.exitCode = 1;
});

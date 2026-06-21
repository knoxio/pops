/**
 * PRD-133 — default sink for `food.ai.logInference`.
 *
 * Lives in its own file so `log-inference.ts` stays under the
 * per-file line cap. The wrapper imports this as the default value
 * for `deps.log`; tests and other callers can inject their own.
 *
 * Behaviour: POSTs the row to the food pillar's internal REST route
 * `POST /ai/log-inference` when `POPS_API_URL` + `POPS_API_INTERNAL_TOKEN`
 * are configured. `POPS_API_URL` is the food-api host; the route is gated
 * on the `x-pops-internal-token` header (see the food pillar `app.ts`
 * `INTERNAL_PATHS`). Otherwise no-ops (browser, dev, vitest). Throws on
 * non-2xx — the wrapper catches and routes the error to `warn`.
 */
import type { LogFoodInferenceFn } from './log-inference-types.js';

function readEnvFromProcess(name: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const env = process.env;
  if (!env) return undefined;
  const value = env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export const logFoodInference: LogFoodInferenceFn = async (input) => {
  const apiUrl = readEnvFromProcess('POPS_API_URL');
  const token = readEnvFromProcess('POPS_API_INTERNAL_TOKEN');
  if (!apiUrl || !token) return;
  if (typeof globalThis.fetch !== 'function') return;

  const url = `${apiUrl.replace(/\/+$/, '')}/ai/log-inference`;
  const res = await globalThis.fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-pops-internal-token': token,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`food.ai.logInference returned HTTP ${res.status}`);
  }
};

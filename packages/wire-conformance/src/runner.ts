import {
  WIRE_ASSERTIONS,
  type AssertionResult,
  type ConformanceReport,
  type WireAssertionId,
} from './assertions.js';
import { wf04, wf05, wf06, wf07 } from './handlers/batched.js';
import { wf19, wf20 } from './handlers/headers.js';
import { wf13, wf14, wf17, wf18 } from './handlers/manifest-health.js';
import { wf15, wf16 } from './handlers/registration.js';
import { wf01, wf02, wf03 } from './handlers/single-call.js';
import { wf08, wf09, wf10, wf11, wf12 } from './handlers/subscription.js';
import { DEFAULT_PROBES, type ConformanceInput } from './types.js';

import type { Handler, RunnerContext } from './handlers/context.js';

/**
 * Drive every `WF-NN-*` assertion against a pillar candidate.
 *
 * Designed to be invoked from CI against an in-tree pillar (`pops-finance-api`,
 * `pops-core-api`, the in-package fixture) or against an out-of-tree pillar
 * such as the future Rust reference implementation from PRD-233. The
 * harness is the executable contract: a candidate is "v1 compliant" iff
 * every assertion in {@link WIRE_ASSERTIONS} passes.
 */
export async function runConformance(input: ConformanceInput): Promise<ConformanceReport> {
  const ctx = buildContext(input);
  const results: AssertionResult[] = [];
  for (const id of WIRE_ASSERTIONS) {
    results.push(await runOne(id, ctx));
  }
  const passed = results.filter((r) => r.passed).length;
  return {
    baseUrl: ctx.baseUrl,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export async function runAssertion(
  id: WireAssertionId,
  input: ConformanceInput
): Promise<AssertionResult> {
  return runOne(id, buildContext(input));
}

function buildContext(input: ConformanceInput): RunnerContext {
  return {
    baseUrl: stripTrailingSlash(input.baseUrl),
    coreBaseUrl: stripTrailingSlash(input.coreBaseUrl ?? input.baseUrl),
    apiKey: input.apiKey,
    probes: input.probes ?? DEFAULT_PROBES,
    fetchImpl: input.fetchImpl ?? fetch,
  };
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function runOne(id: WireAssertionId, ctx: RunnerContext): Promise<AssertionResult> {
  const handler = HANDLERS[id];
  try {
    await handler(ctx);
    return { id, passed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id, passed: false, message };
  }
}

const HANDLERS: Record<WireAssertionId, Handler> = {
  'WF-01-single-call-success': wf01,
  'WF-02-single-call-error-envelope': wf02,
  'WF-03-single-call-missing-input': wf03,
  'WF-04-batched-success': wf04,
  'WF-05-batched-preserves-order': wf05,
  'WF-06-batched-mixed-success-error': wf06,
  'WF-07-batched-malformed-envelope': wf07,
  'WF-08-subscription-content-type': wf08,
  'WF-09-subscription-frame-format': wf09,
  'WF-10-subscription-heartbeat': wf10,
  'WF-11-subscription-error-event': wf11,
  'WF-12-subscription-bad-input': wf12,
  'WF-13-manifest-shape': wf13,
  'WF-14-manifest-cache-control': wf14,
  'WF-15-registration-success': wf15,
  'WF-16-registration-bad-key': wf16,
  'WF-17-health-healthy': wf17,
  'WF-18-health-unhealthy': wf18,
  'WF-19-request-id-echo': wf19,
  'WF-20-wire-version-unsupported': wf20,
};

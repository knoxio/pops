import type { InferenceRecord } from './record-schema.js';
import type { InferenceContext, ReportInferenceFn } from './types.js';

/** The provenance fields shared by every emitted record (no measurements). */
export type BaseRecord = Pick<InferenceRecord, 'provider' | 'model' | 'operation' | 'domain'> &
  Partial<Pick<InferenceRecord, 'contextId' | 'promptVersion' | 'metadata'>>;

/** Projects an {@link InferenceContext} onto the provenance subset of a record. */
export function buildBaseRecord(ctx: InferenceContext): BaseRecord {
  return {
    provider: ctx.provider,
    model: ctx.model,
    operation: ctx.operation,
    domain: ctx.domain,
    ...(ctx.contextId !== undefined ? { contextId: ctx.contextId } : {}),
    ...(ctx.promptVersion !== undefined ? { promptVersion: ctx.promptVersion } : {}),
    ...(ctx.metadata !== undefined ? { metadata: ctx.metadata } : {}),
  };
}

export function noopWarn(): void {}

/** A fire-and-forget reporter that funnels sink failures to `warn`. */
export function makeFire(
  report: ReportInferenceFn,
  warn: (message: string, error: unknown) => void
): (record: InferenceRecord) => void {
  return (record) => {
    void report(record).catch((error: unknown) => warn('ai-telemetry: report failed', error));
  };
}

export function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

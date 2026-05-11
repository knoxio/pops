/**
 * Shared error normalisation helper.
 *
 * Cerebrum pages all consume tRPC mutation/query errors that may be a
 * `TRPCClientError`, an `Error`, or arbitrary `unknown` payloads. The
 * UI only needs a short human-readable message; extract it consistently
 * so every panel renders the same fallback when the shape is unexpected.
 *
 * The `fallback` is caller-provided (typically already translated via
 * `useTranslation`) so the helper stays UI-agnostic and pt-BR consumers
 * never see English literals.
 */
export function extractMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return fallback;
}

import { TRPCError } from '@trpc/server';

/**
 * Wrap a router handler so that any error becomes an INTERNAL_SERVER_ERROR
 * (TRPC errors are passed through unchanged).
 */
export async function withTrpcInternalError<T>(
  defaultMessage: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: err instanceof Error ? err.message : defaultMessage,
    });
  }
}

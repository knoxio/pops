/** tRPC proxy nodes are functions, not objects — allow both types when traversing. */
export function traverseTrpcPath(client: unknown, procedure: string): Record<string, unknown> {
  const parts = procedure.split('.');
  let current: unknown = client;
  for (const part of parts) {
    if (current == null || (typeof current !== 'object' && typeof current !== 'function')) {
      throw new Error(`Unknown procedure: ${procedure}`);
    }
    current = (current as Record<string, unknown>)[part];
    if (current == null) throw new Error(`Unknown procedure: ${procedure}`);
  }
  if (current == null || (typeof current !== 'object' && typeof current !== 'function')) {
    throw new Error(`Cannot call procedure: ${procedure}`);
  }
  return current as Record<string, unknown>;
}

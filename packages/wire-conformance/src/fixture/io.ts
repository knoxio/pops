import { randomUUID } from 'node:crypto';

import type { IncomingMessage } from 'node:http';

export function pickRequestId(req: IncomingMessage): string {
  const incoming = req.headers['x-request-id'];
  if (typeof incoming === 'string' && incoming.length > 0) return incoming;
  return randomUUID();
}

export async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJson(req: IncomingMessage): Promise<unknown | undefined> {
  const raw = await readRawBody(req);
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

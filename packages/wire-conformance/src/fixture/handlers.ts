import { readJson, readRawBody } from './io.js';
import { FIXTURE_API_KEY, FIXTURE_PILLAR_ID, buildFixtureManifest } from './manifest.js';
import {
  errorEnvelope,
  respondHttpError,
  respondTrpcError,
  runProcedure,
  type ProcedureResponse,
} from './responses.js';

import type { IncomingMessage, ServerResponse } from 'node:http';

export function handleHealth(_req: IncomingMessage, res: ServerResponse, url: URL): void {
  const simulate = url.searchParams.get('simulate');
  if (simulate === 'unhealthy') {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        ok: false,
        status: 'unhealthy',
        pillar: FIXTURE_PILLAR_ID,
        version: '0.1.0',
        ts: new Date().toISOString(),
        reason: 'simulated',
      })
    );
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      ok: true,
      status: 'healthy',
      pillar: FIXTURE_PILLAR_ID,
      version: '0.1.0',
      ts: new Date().toISOString(),
    })
  );
}

export function handleManifest(res: ServerResponse): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(buildFixtureManifest()));
}

export async function handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const apiKey = req.headers['x-internal-api-key'];
  if (typeof apiKey !== 'string' || apiKey !== FIXTURE_API_KEY) {
    respondTrpcError(res, 'UNAUTHORIZED', 'invalid X-Internal-API-Key');
    return;
  }
  const body = await readJson(req);
  const envelope = body as { input?: { pillarId?: unknown } } | undefined;
  if (envelope?.input === undefined) {
    respondTrpcError(res, 'BAD_REQUEST', 'missing input');
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const pillarId =
    typeof envelope.input.pillarId === 'string' ? envelope.input.pillarId : FIXTURE_PILLAR_ID;
  res.end(
    JSON.stringify({
      result: {
        data: { ok: true, pillarId, registeredAt: new Date().toISOString() },
      },
    })
  );
}

export async function handlePost(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<void> {
  const raw = await readRawBody(req);
  const procedures = path.split(',');
  const isBatched = procedures.length > 1;
  const parsed = tryParseJson(raw);

  if (parsed === undefined) {
    if (isBatched) {
      respondHttpError(res, { httpStatus: 400, code: 'BAD_REQUEST', message: 'malformed JSON' });
      return;
    }
    respondTrpcError(res, 'BAD_REQUEST', 'malformed JSON');
    return;
  }

  if (isBatched) {
    runBatch(res, procedures, parsed);
    return;
  }

  runSingle(res, path, parsed);
}

function tryParseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function runBatch(res: ServerResponse, procedures: string[], parsed: unknown): void {
  const indexed = parsed as Record<string, { input?: unknown } | undefined>;
  const responses: ProcedureResponse[] = procedures.map((proc, idx) => {
    const entry = indexed[String(idx)];
    if (entry === undefined || entry.input === undefined) {
      return errorEnvelope('BAD_REQUEST', 'missing input', proc);
    }
    return runProcedure(proc, entry.input);
  });
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(responses));
}

function runSingle(res: ServerResponse, path: string, parsed: unknown): void {
  if (typeof parsed !== 'object' || parsed === null || !('input' in parsed)) {
    respondTrpcError(res, 'BAD_REQUEST', 'missing input', { path });
    return;
  }
  const envelope = parsed as { input: unknown };
  const result = runProcedure(path, envelope.input);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(result));
}

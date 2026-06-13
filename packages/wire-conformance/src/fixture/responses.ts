import type { ServerResponse } from 'node:http';

export type ProcedureResponse =
  | { result: { data: unknown } }
  | { error: { code: string; message: string; data: Record<string, unknown> } };

export function httpStatusFor(code: string): number {
  switch (code) {
    case 'BAD_REQUEST':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'NOT_FOUND':
      return 404;
    case 'METHOD_NOT_SUPPORTED':
      return 405;
    default:
      return 500;
  }
}

export function errorEnvelope(code: string, message: string, path?: string): ProcedureResponse {
  const data: Record<string, unknown> = {
    code,
    httpStatus: httpStatusFor(code),
  };
  if (path !== undefined) data.path = path;
  return { error: { code, message, data } };
}

export function runProcedure(procedure: string, input: unknown): ProcedureResponse {
  if (procedure === 'fixture.ping') {
    return { result: { data: { ok: true, echo: input } } };
  }
  if (procedure === 'fixture.notFound') {
    return errorEnvelope('NOT_FOUND', 'fixture-not-found', procedure);
  }
  return errorEnvelope('NOT_FOUND', `unknown procedure ${procedure}`, procedure);
}

export function respondTrpcError(
  res: ServerResponse,
  code: string,
  message: string,
  extraData?: Record<string, unknown>
): void {
  respondHttpError(res, { httpStatus: 200, code, message, extraData });
}

export type HttpErrorBody = {
  httpStatus: number;
  code: string;
  message: string;
  extraData?: Record<string, unknown>;
};

export function respondHttpError(res: ServerResponse, body: HttpErrorBody): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.statusCode = body.httpStatus;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const data: Record<string, unknown> = { code: body.code, httpStatus: httpStatusFor(body.code) };
  if (body.extraData !== undefined) {
    for (const [k, v] of Object.entries(body.extraData)) data[k] = v;
  }
  res.end(JSON.stringify({ error: { code: body.code, message: body.message, data } }));
}

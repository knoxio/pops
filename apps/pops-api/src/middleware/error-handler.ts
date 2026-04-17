import { HttpError } from '../shared/errors.js';

import type { NextFunction, Request, Response } from 'express';

/**
 * Global error handler.
 * Handles custom HttpError subclasses with their status codes.
 * Returns generic messages in production — no stack traces, no SQL errors, no file paths.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  console.error('[pops-api] Unhandled error:', err.message);

  const isDev = process.env['NODE_ENV'] !== 'production';

  res.status(500).json({
    error: 'Internal server error',
    ...(isDev ? { message: err.message } : {}),
  });
}

/**
 * Structured logging for the core pillar container.
 *
 * Ported minimally from `apps/pops-api/src/lib/logger.ts` — that file is
 * monolith-internal source and cannot be imported across the app
 * boundary, so the AI-Ops routers folded into this pillar get their own
 * pino instance here. Same JSON-in-prod / pretty-in-dev behaviour.
 */
import pino from 'pino';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport:
    process.env['NODE_ENV'] === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

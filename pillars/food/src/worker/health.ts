import { createServer } from 'node:http';

import type { Server } from 'node:http';

/**
 * Health endpoint contract:
 *   GET /healthz → { ok: true, queueRunning: boolean, activeJobs: number }
 *
 * Anything else (path, method) returns 404. Used by the compose healthcheck
 * and external monitoring only — the food API never calls this.
 */
export interface HealthState {
  isQueueRunning: () => boolean;
  getActiveJobCount: () => number;
}

export function startHealthServer(port: number, state: HealthState): Server {
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      const body = JSON.stringify({
        ok: true,
        queueRunning: state.isQueueRunning(),
        activeJobs: state.getActiveJobCount(),
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  server.listen(port);
  return server;
}

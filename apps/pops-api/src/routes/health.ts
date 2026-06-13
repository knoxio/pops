import { sql } from 'drizzle-orm';
import { type Router as ExpressRouter, Router } from 'express';

import { getCoreDrizzle } from '../db.js';
import { getRedisStatus } from '../redis.js';

const router: ExpressRouter = Router();

const apiVersion =
  process.env.BUILD_VERSION && process.env.BUILD_VERSION !== 'dev'
    ? `a${process.env.BUILD_VERSION}`
    : 'dev';

/**
 * Pillar identity for the ADR-026 health contract. This process is the `core`
 * pillar in the eventual pillar architecture (settings, AI Ops, pillar
 * registry, URI dispatcher). The id is the slug other pillars use to address
 * core in `POPS_PILLARS` and in `pops:core/...` URIs.
 */
const SELF_PILLAR_ID = 'core';

router.get('/health', (_req, res) => {
  try {
    const db = getCoreDrizzle();
    const rows = db.all<{ ok: number }>(sql`SELECT 1 AS ok`);
    if (rows[0]?.ok === 1) {
      const redisStatus = getRedisStatus();
      // `ok: true` and `pillar` are the ADR-026 P2 pillar-health contract
      // fields. `status: 'ok'`, `version`, `ts`, `redis` are kept for
      // backwards compatibility with existing Docker healthchecks and
      // dashboards.
      res.json({
        ok: true,
        pillar: SELF_PILLAR_ID,
        status: 'ok',
        version: apiVersion,
        ts: new Date().toISOString(),
        redis: redisStatus === 'ready' ? 'ok' : 'down',
      });
    } else {
      res.status(503).json({ status: 'unhealthy', reason: 'sqlite check failed' });
    }
  } catch {
    res.status(503).json({ status: 'unhealthy', reason: 'database unreachable' });
  }
});

export default router;

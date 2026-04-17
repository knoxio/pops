/**
 * /env REST routes — CRUD for named environments.
 *
 * Plain Express routes (not tRPC) so the env context middleware can be mounted
 * AFTER these routes, ensuring env CRUD itself always uses the prod DB.
 *
 * Auth: These routes have no application-level auth guard by design.
 *       DEPLOYMENT REQUIREMENT: Cloudflare Access MUST front this service in production.
 *       Without it, these endpoints allow unauthenticated environment creation/deletion.
 *       Do NOT expose this service directly to the internet without CF Access in place.
 *       In local/test environments this is intentional — the service is not externally
 *       reachable.
 */
import { type Router as ExpressRouter, Router } from 'express';

import {
  createEnv,
  deleteEnv,
  getEnvRecord,
  listEnvs,
  ttlRemaining,
  updateEnvTtl,
  validateEnvName,
} from './registry.js';

import type { EnvRecord } from './registry.js';

interface EnvRequestBody {
  seed?: unknown;
  ttl?: unknown;
}

interface FormattedEnvRecord {
  name: string;
  seedType: string;
  ttlSeconds: number | null;
  ttlRemaining: number | null;
  createdAt: string;
  expiresAt: string | null;
}

const envRouter: ExpressRouter = Router();
envRouter.use((_req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

/** POST /env/:name — create a new environment */
envRouter.post('/env/:name', (req, res) => {
  const { name } = req.params;

  const validationError = validateEnvName(name);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  if (getEnvRecord(name)) {
    res.status(409).json({ error: `Environment '${name}' already exists` });
    return;
  }

  const body: EnvRequestBody =
    typeof req.body === 'object' && req.body !== null ? (req.body as EnvRequestBody) : {};
  const seedType = body.seed === 'test' ? 'test' : 'none';
  const ttlSeconds: number | null = typeof body.ttl === 'number' && body.ttl > 0 ? body.ttl : null;

  try {
    const record = createEnv(name, seedType, ttlSeconds);
    res.status(201).json(formatRecord(record));
  } catch (err) {
    console.error('[env] Failed to create environment:', err);
    res.status(500).json({ error: 'Failed to create environment' });
  }
});

/** GET /env — list all environments */
envRouter.get('/env', (_req, res) => {
  const envs = listEnvs().map(formatRecord);
  res.status(200).json(envs);
});

/** GET /env/:name — get environment status */
envRouter.get('/env/:name', (req, res) => {
  const record = getEnvRecord(req.params.name);
  if (!record) {
    res.status(410).json({ error: `Environment '${req.params.name}' not found or expired` });
    return;
  }
  res.status(200).json(formatRecord(record));
});

/** PATCH /env/:name — update TTL */
envRouter.patch('/env/:name', (req, res) => {
  const record = getEnvRecord(req.params.name);
  if (!record) {
    res.status(410).json({ error: `Environment '${req.params.name}' not found or expired` });
    return;
  }

  const patchBody: EnvRequestBody =
    typeof req.body === 'object' && req.body !== null ? (req.body as EnvRequestBody) : {};
  const ttlSeconds: number | null =
    typeof patchBody.ttl === 'number' && patchBody.ttl > 0 ? patchBody.ttl : null;

  const updated = updateEnvTtl(req.params.name, ttlSeconds);
  res.status(200).json(updated ? formatRecord(updated) : null);
});

/** DELETE /env/:name — delete environment */
envRouter.delete('/env/:name', (req, res) => {
  const deleted = deleteEnv(req.params.name);
  if (!deleted) {
    res.status(410).json({ error: `Environment '${req.params.name}' not found or expired` });
    return;
  }
  res.status(204).send();
});

function formatRecord(record: EnvRecord): FormattedEnvRecord {
  return {
    name: record.name,
    seedType: record.seed_type,
    ttlSeconds: record.ttl_seconds,
    ttlRemaining: ttlRemaining(record),
    createdAt: record.created_at,
    expiresAt: record.expires_at,
  };
}

export { envRouter };

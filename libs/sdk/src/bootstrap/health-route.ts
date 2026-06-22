import { errSummary } from './errors.js';

import type { ManifestPayload } from '../manifest-schema/schema.js';
import type { BootstrapLogger } from './logger.js';

export interface HealthResponseLike {
  json(body: unknown): unknown;
  status(code: number): HealthResponseLike;
}

export interface HealthApp {
  get(path: string, handler: (req: unknown, res: HealthResponseLike) => void): unknown;
}

export function mountHealthRoute(
  app: HealthApp | undefined,
  manifest: ManifestPayload,
  logger: BootstrapLogger
): void {
  if (!app) return;
  try {
    app.get(manifest.healthcheck.path, (_req, res) => {
      res.json({
        ok: true,
        status: 'ok',
        pillar: manifest.pillar,
        version: manifest.version,
        ts: new Date().toISOString(),
        contract: {
          package: manifest.contract.package,
          version: manifest.contract.version,
        },
      });
    });
  } catch (err) {
    logger.warn('[pillar-sdk] could not mount health route', {
      path: manifest.healthcheck.path,
      err: errSummary(err),
    });
  }
}

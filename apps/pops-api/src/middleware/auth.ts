import { verifyCloudflareJWT } from './cloudflare-jwt.js';

import type { NextFunction, Request, Response } from 'express';

/**
 * Express middleware that validates Cloudflare Access JWT tokens.
 * Extracts user email from the JWT and attaches it to res.locals.user.
 *
 * In development (NODE_ENV !== "production"), bypasses JWT validation
 * and uses a mock user for local testing.
 *
 * Skips auth for webhook routes (use signature verification)
 * and health checks (public endpoint).
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Webhook routes handle their own auth via signature verification
  if (req.path.startsWith('/webhooks/')) {
    next();
    return;
  }

  // Health check is public
  if (req.path === '/health') {
    next();
    return;
  }

  // In development, skip JWT validation and use mock user
  if (process.env['NODE_ENV'] !== 'production') {
    res.locals['user'] = { email: 'dev@example.com' };
    next();
    return;
  }

  // If Cloudflare Access team name is not configured, trust the tunnel
  // (Cloudflare Access at the tunnel level already authenticates users)
  if (!process.env['CLOUDFLARE_ACCESS_TEAM_NAME']) {
    res.locals['user'] = { email: 'tunnel-authenticated@pops.local' };
    next();
    return;
  }

  const token = req.headers['cf-access-jwt-assertion'];

  if (typeof token !== 'string') {
    res.status(401).json({ error: 'Missing Cloudflare Access JWT' });
    return;
  }

  verifyCloudflareJWT(token)
    .then((payload) => {
      res.locals['user'] = { email: payload.email };
      next();
    })
    .catch((error) => {
      console.error('[auth] JWT verification failed:', error);
      res.status(401).json({ error: 'Invalid Cloudflare Access JWT' });
    });
}

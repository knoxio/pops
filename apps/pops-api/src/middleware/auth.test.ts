import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock cloudflare-jwt before importing auth middleware
vi.mock('./cloudflare-jwt.js', () => ({
  verifyCloudflareJWT: vi.fn(),
}));

import { authMiddleware } from './auth.js';
import { verifyCloudflareJWT } from './cloudflare-jwt.js';

const mockedVerify = vi.mocked(verifyCloudflareJWT);

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    path: '/trpc/some.procedure',
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    locals: {},
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('authMiddleware', () => {
  const originalEnv = process.env['NODE_ENV'];
  const originalTeamName = process.env['CLOUDFLARE_ACCESS_TEAM_NAME'];

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
    process.env['CLOUDFLARE_ACCESS_TEAM_NAME'] = originalTeamName;
    vi.restoreAllMocks();
  });

  describe('route skipping', () => {
    it('skips auth for webhook routes', () => {
      process.env['NODE_ENV'] = 'production';
      const req = createMockReq({ path: '/webhooks/up' });
      const res = createMockRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('skips auth for health check', () => {
      process.env['NODE_ENV'] = 'production';
      const req = createMockReq({ path: '/health' });
      const res = createMockRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('development mode', () => {
    beforeEach(() => {
      process.env['NODE_ENV'] = 'development';
    });

    it('bypasses JWT validation and sets mock user', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.locals['user']).toEqual({ email: 'dev@example.com' });
      expect(mockedVerify).not.toHaveBeenCalled();
    });
  });

  describe('production mode (no team name — tunnel trust)', () => {
    beforeEach(() => {
      process.env['NODE_ENV'] = 'production';
      delete process.env['CLOUDFLARE_ACCESS_TEAM_NAME'];
    });

    it('passes auth with tunnel-authenticated user when team name not set', () => {
      const req = createMockReq({ headers: {} });
      const res = createMockRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.locals['user']).toEqual({ email: 'tunnel-authenticated@pops.local' });
    });
  });

  describe('production mode (with team name — JWT verification)', () => {
    beforeEach(() => {
      process.env['NODE_ENV'] = 'production';
      process.env['CLOUDFLARE_ACCESS_TEAM_NAME'] = 'test-team';
    });

    it('returns 401 when JWT header is missing', () => {
      const req = createMockReq({ headers: {} });
      const res = createMockRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing Cloudflare Access JWT' });
    });

    it('attaches user on valid JWT', async () => {
      mockedVerify.mockResolvedValue({
        email: 'user@example.com',
        aud: ['test-aud'],
        iss: 'https://test.cloudflareaccess.com',
      });

      const req = createMockReq({
        headers: { 'cf-access-jwt-assertion': 'valid.jwt.token' },
      });
      const res = createMockRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      // Wait for async verify to resolve
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      expect(res.locals['user']).toEqual({ email: 'user@example.com' });
    });

    it('returns 401 on invalid JWT', async () => {
      mockedVerify.mockRejectedValue(new Error('Invalid signature'));

      const req = createMockReq({
        headers: { 'cf-access-jwt-assertion': 'invalid.jwt.token' },
      });
      const res = createMockRes();
      const next = vi.fn();

      authMiddleware(req, res, next);

      await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(401));

      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Cloudflare Access JWT' });
    });
  });
});

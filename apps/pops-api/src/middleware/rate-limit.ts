import rateLimit from "express-rate-limit";

/**
 * Rate limiter for public/unauthenticated endpoints (health, webhooks).
 * tRPC endpoints are excluded — they're behind Cloudflare Access auth and
 * include polling-heavy operations (e.g. getImportProgress every 1s) that
 * would exhaust any sensible per-IP window.
 */
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, try again later" },
  skip: (req) => req.path.startsWith("/trpc"),
});

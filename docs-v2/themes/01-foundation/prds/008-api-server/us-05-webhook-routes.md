# US-05: Set up webhook and static file routes

> PRD: [008 — API Server](README.md)
> Status: Done

**GH Issue:** #418

## Audit Findings

**Present:**
- `routes/webhooks/up-bank.ts` sets up the Up Bank webhook receiver at `POST /webhooks/up`
- Webhook verifies `X-Up-Authenticity-Signature` via HMAC-SHA256 before processing; rejects with 401 if missing or invalid
- `routes/media/images.ts` serves cached media images at `GET /media/images/:mediaType/:id/:filename`
- Static file responses include `Cache-Control: public, max-age=31536000, immutable` and `ETag` headers
- Both routes registered in `app.ts` alongside tRPC; webhook raw body parsing registered before `express.json()`
- Webhook raw body parsing (`express.raw()`) is registered before `express.json()` to preserve body for signature verification

## Description

As a developer, I want Express routes for webhooks and static file serving so that non-tRPC endpoints have a home outside the tRPC router.

## Acceptance Criteria

- [x] `routes/webhooks.ts` sets up webhook receiver endpoints (e.g., Up Bank)
- [x] Webhook routes validate signatures before processing
- [x] Static file serving route for media images (`/media/images/:type/:id/:filename`)
- [x] Appropriate cache headers on static file responses
- [x] Webhook routes do not require Cloudflare Access auth (they have their own signature validation)
- [x] Routes registered in `app.ts` alongside tRPC

## Notes

Webhooks and static files don't fit the tRPC model (they're not typed RPC calls). They use plain Express routes. Keep them minimal — the webhook validates the signature and delegates to a service function.

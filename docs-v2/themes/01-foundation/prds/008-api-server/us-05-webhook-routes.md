# US-05: Set up webhook and static file routes

> PRD: [008 — API Server](README.md)
> Status: To Review

## Description

As a developer, I want Express routes for webhooks and static file serving so that non-tRPC endpoints have a home outside the tRPC router.

## Acceptance Criteria

- [ ] `routes/webhooks.ts` sets up webhook receiver endpoints (e.g., Up Bank)
- [ ] Webhook routes validate signatures before processing
- [ ] Static file serving route for media images (`/media/images/:type/:id/:filename`)
- [ ] Appropriate cache headers on static file responses
- [ ] Webhook routes do not require Cloudflare Access auth (they have their own signature validation)
- [ ] Routes registered in `app.ts` alongside tRPC

## Notes

Webhooks and static files don't fit the tRPC model (they're not typed RPC calls). They use plain Express routes. Keep them minimal — the webhook validates the signature and delegates to a service function.

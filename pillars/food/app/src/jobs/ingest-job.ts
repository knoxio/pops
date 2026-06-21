/**
 * PRD-125 — BullMQ contract for the `food.ingest` queue.
 *
 * Canonical source of truth lives in `@pops/food/queue` so producer
 * (`@pops/api`) and consumer (`pops-worker-food`, PRD-126) can both
 * depend on the same types without a `pops-api → @pops/app-food`
 * package-level cycle (api-client / navigation / api). This file
 * re-exports them at the path PRD-125's acceptance criteria specify so
 * the entry-point stays stable for downstream code.
 */
export * from '@pops/food/queue';

# US-07: Finance domain verbs

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As the AI, I have finance verbs so I can query transactions, manage budgets, and work with entities and the wishlist.

## Acceptance Criteria

- [ ] `finance:search-transactions { query?, entity?, since?, until?, type?, limit? }` — returns matching transactions
- [ ] `finance:get-transaction { id }` — returns single transaction with full details
- [ ] `finance:get-budget-summary { period? }` — returns all budgets with spend vs limit
- [ ] `finance:get-wishlist` — returns wishlist items
- [ ] `finance:search-entities { query }` — returns matching entities
- [ ] `finance:get-entity { id }` — returns entity with aliases and transaction count
- [ ] `finance:create-budget { category, amount, period }` — creates a budget
- [ ] `finance:update-budget { id, amount?, period? }` — updates a budget
- [ ] `finance:add-to-wishlist { name, estimatedCost?, url?, notes? }` — adds item
- [ ] `finance:remove-from-wishlist { id }` — removes item
- [ ] `finance:create-entity { name, type }` — creates an entity
- [ ] All verbs registered with Zod param schemas
- [ ] Tests: each verb executes correctly, returns expected data shape

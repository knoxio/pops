# US-01: Tag rule contract

> PRD: [029 — Tag Rule Proposals](README.md)
> Status: Done

## Description

As a user, I want tag rule proposals to be understandable and safe, so that I can approve improvements without risking incorrect tagging.

## Acceptance Criteria

- [x] Define a tag rule model that can:
  - match transactions by pattern (exact / contains / regex)
  - propose one or more tags as suggestions (not forced edits)
- [x] Define bundled ChangeSet operations for tag rules: add / edit / disable / remove.
- [x] Define an impact preview contract for tag rule ChangeSets scoped to the current import session.
- [x] Define source attribution expectations (tag suggestions show their origin as a rule).
- [x] Define the **seed taxonomy (v1)** as the canonical starting vocabulary for an empty database:
  - Income
  - Transfer
  - Groceries
  - Eat Out
  - Coffee
  - Transport
  - Fuel
  - Charging
  - Novated Lease
  - Parking
  - Tolls
  - Public Transport
  - Shopping
  - Home
  - Online
  - Utilities
  - Internet
  - Mobile
  - Subscriptions
  - Entertainment
  - Pub
  - Bar
  - Club
  - Restaurant
  - Health
  - Pharmacy
  - Insurance
  - Rent
  - Mortgage
  - Travel
  - Education
  - Gifts
  - Donations
  - Fees
  - Interest
  - Taxes
  - Deductible
  - Unknown
- [x] Define that AI may propose tags from the seed taxonomy and may propose **brand-new tags** that are clearly marked as **New** and require explicit acceptance before being used.
- [x] Define proposal scopes for tag suggestions:
  - group scope (entity group in Tag Review)
  - transaction scope (single transaction)

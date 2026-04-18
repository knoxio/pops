# Epic 04: Budgets

> Theme: [Finance](../README.md)

## Scope

Build budget tracking — spending categories with monthly or yearly limits. Shows actual spend against target, with active/inactive toggle per budget.

## PRDs

| #   | PRD                                      | Summary                                                                                              | Status |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| 025 | [Budgets](../prds/025-budgets/README.md) | Budget data model, CRUD page, period types (monthly/yearly), spend vs target, active/inactive toggle | Done   |

## Dependencies

- **Requires:** Epic 00 (budgets aggregate transaction data by category)
- **Unlocks:** Nothing directly — standalone feature

## Out of Scope

- Budget alerts or notifications
- Forecasting or trend analysis
- Multi-currency budgets

# US-01: Form layout and validation

> PRD: [046 — Item Create/Edit Form](README.md)
> Status: To Review

## Description

As a user, I want a form to create and edit inventory items with proper validation and dual-mode behaviour so that I can add new items or update existing ones with confidence that the data is correct.

## Acceptance Criteria

- [ ] Create mode renders at `/inventory/items/new` with an empty form
- [ ] Edit mode renders at `/inventory/items/:id/edit` with fields pre-populated from `inventory.items.get`
- [ ] Form fields: Name (text), Type (select + custom), Brand (text), Model (text), Asset ID (text), Location (picker — separate US), Condition (select: new/good/fair/poor/broken, default "good"), Purchase Date (date picker), Purchase Price (currency), Replacement Value (currency), Resale Value (currency), Warranty Expiry (date picker), Notes (markdown textarea with preview toggle)
- [ ] Name is required — form cannot submit without it
- [ ] Type is required — select populated from distinct types in the database, plus a custom entry option for new types
- [ ] Currency fields (Purchase Price, Replacement Value, Resale Value) validate as non-negative numbers
- [ ] Date fields (Purchase Date, Warranty Expiry) validate as valid ISO dates
- [ ] Condition select defaults to "good" in create mode
- [ ] Notes textarea has a preview toggle that renders markdown alongside or replacing the input
- [ ] Create mode: form submits via `inventory.items.create`, then navigates to `/inventory/items/:id`
- [ ] Edit mode: form submits via `inventory.items.update`, then navigates to `/inventory/items/:id`
- [ ] Submit button is disabled while the form is submitting (prevents double submission)
- [ ] Validation errors display inline next to the relevant field
- [ ] Unsaved changes warning prompts the user before navigating away from a modified form
- [ ] 404 page renders if edit mode item ID does not exist
- [ ] Tests cover: create mode empty form, edit mode pre-population, required field validation, currency validation, date validation, submit create, submit update, unsaved changes warning, 404 on invalid ID

## Notes

The form shell handles layout, validation, and submission. The location picker (US-02), photo upload (US-03), and asset ID generation (US-04) are separate components that integrate into this form. Use a form library or controlled components with a validation schema. The type select should allow typing a custom value that does not exist in the dropdown — a combobox pattern.

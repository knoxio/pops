# US-01: Form layout and validation

> PRD: [046 — Item Create/Edit Form](README.md)
> Status: Partial

## Description

As a user, I want a form to create and edit inventory items with proper validation and dual-mode behaviour so that I can add new items or update existing ones with confidence that the data is correct.

## Acceptance Criteria

- [x] Create mode renders at `/inventory/items/new` with an empty form
- [x] Edit mode renders at `/inventory/items/:id/edit` with fields pre-populated from `inventory.items.get`
- [ ] Form fields: Name (text), Type (select + custom), Brand (text), Model (text), Asset ID (text), Location (picker — separate US), Condition (select: new/good/fair/poor/broken, default "good"), Purchase Date (date picker), Purchase Price (currency), Replacement Value (currency), Resale Value (currency), Warranty Expiry (date picker), Notes (markdown textarea with preview toggle) — missing Purchase Price field, Condition accepts ["Excellent","Good","Fair","Poor"] not spec values, Location is plain text not picker
- [x] Name is required — form cannot submit without it
- [ ] Type is required — Type field has no required validation in current form
- [x] Currency fields (Purchase Price, Replacement Value, Resale Value) validate as non-negative numbers
- [x] Date fields (Purchase Date, Warranty Expiry) validate as valid ISO dates
- [ ] Condition select defaults to "good" in create mode — defaults to empty string
- [ ] Notes textarea has a preview toggle that renders markdown alongside or replacing the input — no markdown preview toggle
- [x] Create mode: form submits via `inventory.items.create`, then navigates to `/inventory/items/:id`
- [x] Edit mode: form submits via `inventory.items.update`, then navigates to `/inventory/items/:id`
- [x] Submit button is disabled while the form is submitting (prevents double submission)
- [x] Validation errors display inline next to the relevant field
- [x] Unsaved changes warning prompts the user before navigating away from a modified form
- [x] 404 page renders if edit mode item ID does not exist
- [ ] Tests cover: create mode empty form, edit mode pre-population, required field validation, currency validation, date validation, submit create, submit update, unsaved changes warning, 404 on invalid ID

## Notes

The form shell handles layout, validation, and submission. The location picker (US-02), photo upload (US-03), and asset ID generation (US-04) are separate components that integrate into this form. Use a form library or controlled components with a validation schema. The type select should allow typing a custom value that does not exist in the dropdown — a combobox pattern.

# US-03: Section Renderer & Field Components

> PRD: [PRD-093: Unified Settings System](README.md)

## Description

As a user, I want settings fields to render as appropriate input widgets with inline validation and auto-save so that I can change settings without navigating to app-specific pages or clicking a submit button.

## Acceptance Criteria

### Section & Group Rendering

- [x] A `SectionRenderer` component accepts a `SettingsManifest`, fetches current values via `getBulk`, and renders all groups and fields
- [x] Each group renders as a card with its `title`, optional `description`, and its fields listed vertically
- [x] When the section loads, all settings keys declared in the manifest are fetched via `core.settings.getBulk` — fields with no database value use the manifest's `default`

### Field Components by Type

- [x] `text`: standard text input
- [x] `number`: number input that respects `validation.min` and `validation.max` as constraints
- [x] `toggle`: switch/toggle component (stored as `"true"` / `"false"` strings)
- [x] `select`: dropdown populated from the manifest's `options` array
- [x] `password`: masked input with a reveal toggle button; uses `sensitive: true` display rules
- [x] `url`: text input that validates the value is a well-formed URL
- [x] `duration`: number input paired with a unit selector (milliseconds, seconds, minutes, hours) — stored as milliseconds
- [x] `json`: textarea that validates the value is valid JSON syntax

### Auto-Save

- [x] Changing any field triggers a call to `core.settings.setBulk` after a 500ms debounce — there is no submit button
- [x] While the save is in flight, the field shows a subtle saving indicator
- [x] On successful save, the indicator briefly shows a checkmark then disappears
- [x] If the save fails, an error message is shown below the field (toast)

### Validation

- [x] Validation rules from the manifest's `validation` object are enforced on the client before saving
- [x] Invalid values show an inline error message below the field (using `validation.message` if provided, otherwise a sensible default)
- [x] When a field value is invalid, the debounced save is not triggered — the value is not persisted until valid

### Environment Variable Fallback

- [x] Fields with `envFallback` where no database value exists display a muted label: "Using environment variable {envFallback name}"
- [x] The field remains editable — setting a value overrides the environment variable fallback
- [x] Once a database value is saved, the environment variable label disappears

### Requires Restart Badge

- [x] Fields with `requiresRestart: true` display an amber "Requires restart" badge next to the field label
- [x] When the user changes such a field, a non-blocking toast confirms the change and notes that a restart is needed

### Test Action Button

- [x] Fields with a `testAction` render a button next to the field with the `testAction.label` text
- [x] Clicking the button calls the tRPC procedure specified in `testAction.procedure`
- [x] Success shows a green checkmark indicator next to the button
- [x] Failure shows a red X with the error message next to the button
- [x] The button shows a loading spinner while the procedure is in flight
- [x] Procedures that return `{ data: { connected: false, error?: string } }` without throwing are treated as failures and show the error state
- [x] On success, a `toast.success('Connected')` notification is shown
- [x] On failure, a `toast.error(message)` notification is shown with the error message

### Async Options Loader for Select Fields

- [x] `SectionRenderer` accepts an optional `optionsLoaders` map: `Record<string, () => Promise<{ value: string; label: string }[]>>`
- [x] For select fields whose key appears in `optionsLoaders`, options are loaded asynchronously instead of using the static `options` array from the manifest
- [x] While options are loading, the select shows a loading placeholder
- [x] If the async load fails, the select shows the static `options` as a fallback (if any) and an error indicator

### Tests

- [x] Unit test: render a section with one field of each type — verify the correct widget is rendered for each
- [x] Unit test: change a text field value — verify `core.settings.setBulk` is called after the debounce period and not before
- [x] Unit test: enter an invalid value in a field with a `pattern` validation rule — verify the error message is displayed and `setBulk` is not called
- [x] Unit test: render a field with `envFallback` and no database value — verify the "Using environment variable" label is shown
- [x] Unit test: render a field with `testAction`, click the test button — verify the specified procedure is called
- [x] Unit test: test action resolves — verify `toast.success('Connected')` is called
- [x] Unit test: test action throws — verify `toast.error` is called with the error message

## Notes

- This story depends on the `SettingsManifest` types from US-01 but not on the registry itself — the `SectionRenderer` receives its manifest as a prop.
- The `duration` field stores the value in the database as milliseconds. The unit selector is a UI convenience — converting to/from milliseconds happens in the component.
- The `json` field should validate on blur (not on every keystroke) to avoid invalidating partial JSON while the user is typing.
- The `optionsLoaders` pattern is needed by US-04 for dynamically loading Plex library sections. It keeps the `SectionRenderer` generic — the loader is provided by the consuming code, not hardcoded.

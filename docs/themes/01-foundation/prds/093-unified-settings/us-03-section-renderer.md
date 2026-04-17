# US-03: Section Renderer & Field Components

> PRD: [PRD-093: Unified Settings System](README.md)

## Description

As a user, I want settings fields to render as appropriate input widgets with inline validation and auto-save so that I can change settings without navigating to app-specific pages or clicking a submit button.

## Acceptance Criteria

### Section & Group Rendering

- [ ] A `SectionRenderer` component accepts a `SettingsManifest` and a `Record<string, string>` of current values, and renders all groups and fields
- [ ] Each group renders as a card with its `title`, optional `description`, and its fields listed vertically
- [ ] When the section loads, all settings keys declared in the manifest are fetched via `core.settings.getBulk` — fields with no database value use the manifest's `default`

### Field Components by Type

- [ ] `text`: standard text input
- [ ] `number`: number input that respects `validation.min` and `validation.max` as constraints
- [ ] `toggle`: switch/toggle component (stored as `"true"` / `"false"` strings)
- [ ] `select`: dropdown populated from the manifest's `options` array
- [ ] `password`: masked input with a reveal toggle button; uses `sensitive: true` display rules
- [ ] `url`: text input that validates the value is a well-formed URL
- [ ] `duration`: number input paired with a unit selector (milliseconds, seconds, minutes, hours) — stored as milliseconds
- [ ] `json`: textarea that validates the value is valid JSON syntax

### Auto-Save

- [ ] Changing any field triggers a call to `core.settings.set` after a 500ms debounce — there is no submit button
- [ ] While the save is in flight, the field shows a subtle saving indicator
- [ ] On successful save, the indicator briefly shows a checkmark then disappears
- [ ] If the save fails, an error message is shown below the field

### Validation

- [ ] Validation rules from the manifest's `validation` object are enforced on the client before saving
- [ ] Invalid values show an inline error message below the field (using `validation.message` if provided, otherwise a sensible default)
- [ ] When a field value is invalid, the debounced save is not triggered — the value is not persisted until valid

### Environment Variable Fallback

- [ ] Fields with `envFallback` where no database value exists display a muted label: "Using environment variable {envFallback name}"
- [ ] The field remains editable — setting a value overrides the environment variable fallback
- [ ] Once a database value is saved, the environment variable label disappears

### Requires Restart Badge

- [ ] Fields with `requiresRestart: true` display an amber "Requires restart" badge next to the field label
- [ ] When the user changes such a field, a non-blocking toast confirms the change and notes that a restart is needed

### Test Action Button

- [ ] Fields with a `testAction` render a button next to the field with the `testAction.label` text
- [ ] Clicking the button calls the tRPC procedure specified in `testAction.procedure`
- [ ] Success shows a green checkmark indicator next to the button
- [ ] Failure shows a red X with the error message next to the button
- [ ] The button shows a loading spinner while the procedure is in flight

### Async Options Loader for Select Fields

- [ ] `SectionRenderer` accepts an optional `optionsLoaders` map: `Record<string, () => Promise<{ value: string; label: string }[]>>`
- [ ] For select fields whose key appears in `optionsLoaders`, options are loaded asynchronously instead of using the static `options` array from the manifest
- [ ] While options are loading, the select shows a loading placeholder
- [ ] If the async load fails, the select shows the static `options` as a fallback (if any) and an error indicator

### Tests

- [ ] Unit test: render a section with one field of each type — verify the correct widget is rendered for each
- [ ] Unit test: change a text field value — verify `core.settings.set` is called after the debounce period and not before
- [ ] Unit test: enter an invalid value in a field with a `pattern` validation rule — verify the error message is displayed and `set` is not called
- [ ] Unit test: render a field with `envFallback` and no database value — verify the "Using environment variable" label is shown
- [ ] Unit test: render a field with `testAction`, click the test button — verify the specified procedure is called

## Notes

- This story depends on the `SettingsManifest` types from US-01 but not on the registry itself — the `SectionRenderer` receives its manifest as a prop.
- The `duration` field stores the value in the database as milliseconds. The unit selector is a UI convenience — converting to/from milliseconds happens in the component.
- The `json` field should validate on blur (not on every keystroke) to avoid invalidating partial JSON while the user is typing.
- The `optionsLoaders` pattern is needed by US-04 for dynamically loading Plex library sections. It keeps the `SectionRenderer` generic — the loader is provided by the consuming code, not hardcoded.

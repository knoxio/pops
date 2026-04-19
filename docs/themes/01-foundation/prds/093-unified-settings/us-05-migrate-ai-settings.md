# US-05: Migrate AI Settings

> PRD: [PRD-093: Unified Settings System](README.md)

## Description

As a user, I want AI model configuration to appear in the unified settings page so that I can manage the AI model selection and budget from `/settings` alongside all other system settings.

## Acceptance Criteria

### AI Config Manifest (`ai.config`, order: 200)

- [ ] Manifest is defined in the `@pops/app-ai` package with `id: 'ai.config'`, `title: 'AI Configuration'`, and `order: 200`
- [x] **Model group**: `ai.model` (select field) with options for available models — initially `{ value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku' }` and any other models currently supported
- [x] **Budget group**: `ai.monthlyTokenBudget` (number field with `validation.min: 0`), `ai.budgetExceededFallback` (select field with options `{ value: 'skip', label: 'Skip requests' }` and `{ value: 'alert', label: 'Alert and continue' }`)

### Registration

- [x] The manifest is registered via `settingsRegistry.register()` in the core API module initialization (AI settings live in core)
- [x] Registration happens at API startup alongside other core module setup

### Route Redirect

- [x] `/ai/config` redirects to `/settings#ai.config`

### Cleanup

- [x] `ModelConfigPage` component is removed (not deprecated — fully deleted)
- [x] No dead imports or references to the removed component remain

### Dynamic Model Options

- [x] The model selector supports a dynamic options loader pattern (same as US-03's `optionsLoaders`) so that future model providers (e.g., Ollama from PRD-092) can contribute options at runtime
- [x] Until a provider registry exists, the options are hardcoded in the manifest's static `options` array — the loader is wired up but returns the static list

## Notes

- The "current month usage vs. budget" display that exists on `ModelConfigPage` is a monitoring concern, not a settings concern. It belongs on an AI monitoring dashboard (PRD-092 US-06) and must not be migrated to the settings page.
- The model selector options should eventually come from an AI provider registry (PRD-092). For now, hardcode the current options in the manifest. When PRD-092 lands, replace the static `options` array with a dynamic loader that queries the provider registry.
- The `ai.model` and `ai.monthlyTokenBudget` keys should match whatever keys the AI module currently reads from the settings table. If the existing keys differ, add the correct keys to the manifest — do not rename existing database keys.

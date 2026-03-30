# US-01: Wizard scaffold

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a developer, I want the ImportWizard component with step navigation and Zustand state management so that the 6-step flow has a foundation to build on.

## Acceptance Criteria

- [x] ImportWizard component with visual step indicator (numbered circles + progress bar)
- [x] Zustand store (`importStore`) with all state fields and navigation actions
- [x] `nextStep()`, `prevStep()`, `goToStep(n)`, `reset()` navigation
- [x] Steps are sequential — Next button disabled until current step validates
- [x] Back button available on steps 2+
- [x] ImportPage wraps ImportWizard and calls `reset()` on mount
- [x] Step indicator shows current step, completed steps, and remaining steps

## Notes

Each step component is built in subsequent USs. The scaffold provides the container and navigation framework.

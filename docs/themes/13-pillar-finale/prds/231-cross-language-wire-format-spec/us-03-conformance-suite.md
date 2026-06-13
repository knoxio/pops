# US-03: Wire-format conformance suite

> PRD: [Cross-language SDK wire-format spec](README.md)

## Description

As an engineer who has just implemented a non-TS pillar against the wire-format spec, I want to point a black-box conformance harness at my running pillar and get a binary green/red answer about whether it complies with v1, so that I know my pillar will work with the registry, the consumption SDK, and existing TS consumers before I attempt to register it.

## Acceptance Criteria

- [x] A pnpm package exists at `packages/wire-conformance/` (or the location the maintainer chooses) with a CLI entry point `pnpm wire-conformance --base-url <url> --manifest <path>`.
- [x] The CLI accepts at minimum `--base-url`, `--manifest` (path to the expected manifest JSON), and `--report-format=json|tap|human` flags.
- [x] The suite runs entirely as black-box HTTP probes. No code from the target pillar is imported. No language-specific assumptions are made (no "must have a `package.json`", no "must expose a tRPC router object").
- [x] At least one assertion exists per section of the wire-format spec: single-call success, single-call error, batched success, batched mixed success/error, batched preserves order, subscription emits `data:` events, subscription emits `\n\n` separators, subscription heartbeat is observed, manifest endpoint returns shape matching `ManifestPayloadSchema`, health endpoint returns the documented shape, `X-Request-Id` is echoed when sent.
- [x] Each assertion produces a stable identifier (e.g. `WF-01-single-call-success`, `WF-04-batched-preserves-order`) referenced in the report and in the spec doc itself.
- [x] The suite knows how to run against `@pops/pillar-sdk` as the baseline. A CI job runs the conformance suite against every in-tree pillar on PR.
- [x] The suite documents how to run it against an arbitrary external pillar (URL pointing at e.g. a Rust pillar on a different docker network). The doc lives in the package README.
- [x] Exit code is 0 if every assertion passes, non-zero otherwise. CI consumes the exit code.
- [x] Each assertion's failure message says (a) which spec section it tests, (b) what was expected, (c) what was observed. No assertion fails with a stack trace pointing at the suite's internals — the failure must be actionable for the pillar author.
- [x] The suite is _not_ a load test, _not_ a fuzzer, _not_ a chaos test. It is a compliance check. Performance budgets and adversarial probes are explicitly out of scope.
- [x] A single unit test in the suite asserts the suite itself passes against a known-compliant reference (the TS in-tree finance pillar) and fails against a deliberately broken mock (e.g. a pillar that returns batched responses out of order).

## Notes

Implement assertions against `fetch` and `EventSource` (or `undici`'s equivalents). Avoid pulling in a heavyweight test framework — the suite needs to run from a CLI and report to CI; vitest or jest are overkill. A simple async function per assertion + a runner that aggregates results is enough.

Stable assertion identifiers matter. They go into changelogs ("PR #N adds assertion WF-12-subscription-reconnect") and into the spec doc so spec readers can cross-reference. Pick an identifier scheme and stick with it.

The conformance suite is the executable contract. The spec document is the human-readable version. If they disagree, fix the suite first (it's the testable artifact), then update the spec to match.

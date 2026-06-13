# @pops/wire-conformance

Executable conformance suite for the [POPS pillar wire-format
specification v1](../../docs/themes/13-pillar-finale/specs/pillar-wire-format-v1.md).

A pillar is "v1 compliant" iff every `WF-NN-*` assertion in
`src/assertions.ts` passes against it. The set is closed: adding or
renaming an ID is a wire-format minor bump and requires an ADR.

## Run the suite

Against the in-package fixture pillar (the CI baseline):

```bash
pnpm --filter @pops/wire-conformance test
```

Against an external pillar from your own test / script:

```ts
import { runConformance } from '@pops/wire-conformance';

const report = await runConformance({
  baseUrl: 'http://my-pillar:3010',
  coreBaseUrl: 'http://core-api:3000',
  apiKey: process.env.POPS_INTERNAL_API_KEY!,
});

console.log(report);
// {
//   baseUrl: 'http://my-pillar:3010',
//   total: 20,
//   passed: 20,
//   failed: 0,
//   results: [{ id: 'WF-01-single-call-success', passed: true }, ...]
// }
```

## Required probes

The harness needs to know which procedures to exercise. Defaults match the
fixture pillar; override them for in-tree or external pillars:

```ts
runConformance({
  baseUrl: 'http://finance:3010',
  apiKey: '…',
  probes: {
    successProcedure: 'finance.health.ping',
    notFoundProcedure: 'finance.transactions.get',
    subscriptionProcedure: 'finance.events.watch',
    idleSubscriptionProcedure: 'finance.events.idle',
    errorSubscriptionProcedure: 'finance.events.failing',
    registrationPillarId: 'finance',
  },
});
```

## Authoring a new pillar

The fastest path to compliance is `@pops/pillar-sdk`. The SDK is the
reference TS implementation and is run through this suite in CI.

For non-TS pillars (e.g. the Rust port from PRD-233): stand up a HTTP
service exposing `/trpc/*`, `/manifest.json`, and `/health`, then run
this harness from a TS CI job pointed at it.

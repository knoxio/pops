# US-05 _(optional)_: Developer doc — typed proxy for in-repo pillars; `callDynamic` for external pillars

> PRD: [PRD-242 — Dynamic `AppRouter` composition](README.md)

## Description

As an external-pillar author or an in-repo developer adding a new consumer call site, I want a one-page note that explains the split between the typed `trpc.<pillar>.<router>.<proc>` proxy (for in-repo pillars) and `pillar(id).callDynamic(routerName, procName, input, kind)` (for external pillars) so that I pick the right tool without having to reverse-engineer it from the codebase.

## Acceptance Criteria

- [ ] A note exists at `docs/themes/13-pillar-finale/notes/internal-vs-external-pillar-call-sites.md` (or equivalent path inside `docs/themes/13-pillar-finale/notes/`).
- [ ] The note explains the two consumer-side paths:
  - **In-repo pillar** → `trpc.<pillar>.<router>.<proc>` typed proxy (existing pattern). Static type comes from the codegen-derived `AppRouter`.
  - **External pillar** → `pillar(id).callDynamic(routerName, procName, input, kind)` runtime escape hatch from [PR #3131](https://github.com/knoxio/pops/pull/3131). Return type is `CallResult<unknown>`; caller validates the response shape.
- [ ] The note explains _why_ the split exists (TypeScript cannot know an out-of-repo pillar's procedure shape at compile time without a generated SDK package; PRD-242 deliberately stops short of that step).
- [ ] The note gives one runnable example for each path.
- [ ] The note cross-links to: [PRD-228](../228-dynamic-pillar-registration/README.md) (the registration surface), [PRD-233](../233-external-pillar-example-repo/README.md) (the Rust example pillar), [PRD-242](README.md) (this PRD), and `packages/pillar-sdk/src/client/proxy.ts:26-72` (`CallDynamicFn`).
- [ ] The note is linked from the PRD-228 README's "References" section and the PRD-233 README's developer-onboarding section.
- [ ] The note is < 1 page (per `docs/CLAUDE.md`'s sizing rule).
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This US is **optional** — it does not block the H3 finding's closure. US-01..04 deliver the working software; US-05 documents the decision for future authors.
- It is the cheapest US in the PRD. Useful to ship alongside US-04 so the integration test's intent is documented.
- The note belongs under `docs/themes/13-pillar-finale/notes/`, not under the PRD folder, because it has long-lived developer-onboarding value beyond PRD-242's completion.
- The note is the natural follow-on to the pillar-isolation audit at `docs/themes/13-pillar-finale/notes/pillar-isolation-audit.md` — the audit named the problem (H3), the note names the resolution.
- Per `docs/CLAUDE.md` (writing rules): no meta-commentary about the doc, no preamble. Start with the rule, follow with the example, end with the cross-links.

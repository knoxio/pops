# US-03: Post-mortem — does Option B (cross-pillar aggregation) need to ship?

> PRD: [PRD-244 — Cross-pillar SDK surface](README.md)

## Description

As the maintainer of the cross-pillar consumption surface, I want a recorded
verdict — after US-01 (`app-ai`) and US-02 (`app-finance` batch 2) have landed
— on whether the Option B `crossPillarQuery` affordance is worth scoping into
a successor PRD, so that the decision is documented instead of carried in
head.

## Acceptance Criteria

- [ ] A note exists at
      `docs/themes/13-pillar-finale/notes/cross-pillar-sdk-post-mortem.md` (or
      an equivalent path inside `docs/themes/13-pillar-finale/notes/`).
- [ ] The note records the count of multi-call cross-pillar sites observed in
      the US-01 + US-02 migrations (the hand-rolled `isLoading = a || b`
      pattern). Cites exact files.
- [ ] The note records the count of cross-pillar `utils.invalidate()` chains
      that required two SDK calls instead of one. Cites exact files.
- [ ] The note assesses developer-experience pain on a small scale
      (e.g. "fine / annoying / blocking") with concrete evidence — not a vibe
      check.
- [ ] The note delivers a verdict:
  - **Ship Option B.** Scope successor PRD, name it inline. Identify the
    one or two affordances that hurt most (likely
    `usePillarQueries({ queries: [{ pillarId, … }, …] })` extended to
    heterogeneous `pillarId`).
  - **OR close the question.** Option A is enough. Future cross-pillar
    consumers follow the same pattern. No successor PRD.
- [ ] The note is linked from this PRD's `## Status` section, from PRD-227's
      references, and from the cross-pillar SDK section of the FE-SDK epic
      (epic 10).
- [ ] The note is < 1 page (per `docs/CLAUDE.md`'s sizing rule).
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This US is **not optional** even when the verdict is "close the question."
  The recorded decision is the deliverable; an undocumented "we decided not
  to" is worth less than a documented one.
- US-03 cannot start until US-01 and US-02 are both merged. The whole point
  is to look at the migrated code, not at the audit doc.
- If US-03's verdict is "ship Option B," the successor PRD is filed in this
  US's wrap-up comment with a number reserved at the time. Do not pre-allocate
  the number here.
- Resist the urge to design Option B in this US. The deliverable is a
  verdict, not a spec. If the verdict is "ship it," the successor PRD does
  the design work.
- Use the PRD-227 sign-off pattern (a short note, decisive language, no
  hand-waving) as the template.

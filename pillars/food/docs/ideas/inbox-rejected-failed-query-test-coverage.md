# Idea: Server-side test coverage for the Rejected/Failed inbox queries

The Rejected and Failed tabs ship and their server queries are exercised end-to-end by hand, but the automated server tests are thinner than the behaviour they back.

What exists today:

- `src/api/__tests__/inbox.test.ts` asserts the REST wire envelopes only — empty `pendingCount`, empty `failedErrorCodes`, empty `list` / `listRejected` / `listFailed` pages, and three mutation/inspector guards (`VersionNotFound`, `NoteRequired`, `SourceNotFound`).
- `src/db/__tests__/inbox-drafts.test.ts` covers `listDrafts` (the Drafts tab) inclusion/exclusion, filtering, sort, and cursor pagination.

What is **not** covered by any test:

- `listRejectedVersions` filtering (reason × kind × sinceDays) and its exclusion of manually-discarded archived versions (rows with no `recipe_version_rejections` record).
- `listFailedSources` exclusion of sources whose latest run succeeded (`error_code`/`error_message` cleared as a pair).
- `listFailedSources` exclusion of auth-dead `ok:true` placeholder drafts (they never set `error_code`, so they should never reach the Failed tab).
- `listFailedSources` / `listRejectedVersions` cursor pagination across pages.

## Build later

Add db-layer tests next to `inbox-drafts.test.ts` (e.g. `inbox-rejected.test.ts`, `inbox-failed.test.ts`) that seed `ingest_sources` + `recipe_versions` + `recipe_version_rejections` fixtures and assert:

- a manually-discarded archived version is absent from `listRejected`;
- a source with a cleared error pair is absent from `listFailed`;
- an `auth-dead` placeholder draft is absent from `listFailed` (and present in `listDrafts`);
- reason/kind/sinceDays/errorCode filters narrow correctly and the cursor walks pages without dupes.

These are the assertions the PRD's acceptance criteria describe as the behavioural contract; today they rest on manual verification and the type system rather than executable tests.

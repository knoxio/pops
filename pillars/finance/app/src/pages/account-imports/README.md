# The account imports page

`/accounts/:id/imports` (POPS-2919, finance ADR-003) answers three questions the account page deliberately does not: how this account is fed, when it last was, and what every import wrote. The account page shows the result and links here; this is the plumbing behind it.

What is worth knowing before reading the files:

- **The config read 404s for an account fed by hand, and that is the answer.** `useAccountImportsPage` turns it into `null` rather than an error, and the page waits for it before rendering: showing "fed by hand" for an account whose config had not arrived yet would also refuse its sync.
- **The config is written whole.** `SourceFormDialog` sends every field its chosen kind uses and nulls the rest, because the server refuses a config that names a kind without what the kind needs, and a partial write could leave a CSV dialect beside a provider's account id. The token never appears here: the form names the secret it is read from.
- **A sync stages, it does not import.** After POPS-3334 a pass writes nothing to the ledger, so the result reads "N staged for review" and the rows it fetched appear as a pending-import card in Status (the same card the dashboard and the wizard's first step compose). `syncRefusal` decides whether the action is on offer at all, and its reason is shown beside the button rather than in a tooltip, because a disabled control never fires the events a tooltip waits for.
- **`Last fed` is not `Last sync`.** `importStatus.lastImportAt` is the later of the newest batch and the last provider pass, so an account synced with nothing new still reads as current; the sync time is shown beside it, because a pass that found nothing is the difference between an account that is quiet and one whose sync stopped running.

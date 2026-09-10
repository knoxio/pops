# @pops/app-purchases

The frontend module for the purchases pillar. It registers `/purchases` with
`pillars/shell` and puts the pillar on the app rail.

Frontend-only: this package owns no database. Everything goes over the
purchases pillar's REST contract through the generated
`@hey-api/client-fetch` client in `src/purchases-api/`, served at the shell's
`/purchases-api` proxy path (see `src/purchases-api-runtime-config.ts`).

## How it mounts

The shell's runtime loader (`external-ui.tsx`) imports the built ESM bundle at
the URL this pillar's manifest advertises and looks each page up by its
`bundleSlot` in the module's `bundles` export. Purchases was the first
in-repo pillar to arrive that way (POPS-3217), and since POPS-3227 it is the
only way any pillar arrives — the static build-time mount `@pops/shell` used
to hold every other pillar's `routes` through is gone, and `@pops/shell` does
not depend on this package.

`src/bundles.ts` is that record. It is `PAGE_COMPONENTS` from `src/routes.tsx`
under the name the wire uses, so the two mount paths cannot name different
components for one page — and the slot⇄path pairing itself lives once, in
`@pops/purchases/manifest`'s `PURCHASES_PAGES`, which the pillar's wire
manifest projects and this app derives from. A page with no component behind
it is a compile error at `PAGE_COMPONENTS`, not a blank screen.

### The remote build

`pnpm --filter @pops/app-purchases build` emits `dist/remote/purchases.js` —
one ESM entry exporting `bundles`, with a lazily-imported chunk per page, built
by `vite.remote.config.ts`. The package itself stays source-only; this build
is alongside it, not instead of it.

`pillars/purchases/app/Dockerfile` serves that output as a static nginx image
(`purchases-ui`), which the shell's generated `/purchases-ui/` location proxies
to. It is a second image of this pillar rather than part of
`pillars/purchases/Dockerfile`, for the reason the design playground ships two:
that image is a narrow API container with a hand-curated dependency closure, and
pulling a bundler into it would make every pillar API image carry one.

The entry keeps a stable filename because it is half of the `assetsBaseUrl` the
registry advertises; the chunks beside it are content-hashed. The nginx conf
serves the entry `no-cache` and the chunks `immutable`, which is the same split
`pops-shell` runs for `index.html` against `/assets/`. The image also declares
`pops.smoke.health` / `pops.smoke.freshness` labels, because it serves a module
rather than a page and `/` is a 404 by design.

Everything on the shared-runtime list in `@pops/pillar-sdk/remote-build` —
React, the router, the query client, i18next, `@pops/ui` — is **external**. A
second copy of any of those is not a size problem but a correctness one, and
none of them fails at build time: two Reacts throw `Invalid hook call` on the
pillar's first hook, two query clients read an empty cache, two i18next
instances render raw keys. `scripts/build-remote.ts` reads the build's own
module graph and fails the build, deleting the output, if any of them ended up
inside. The shell's half of the contract — an import map resolving those bare
specifiers to its own chunks — is POPS-3217.

No Tailwind here either: a loader-mounted pillar renders inside the shell's
document under the stylesheet the shell already emits, whose `@source` globs
cover this app. Running this app standalone needs its own theme entry, which
is a different build target.

## Running it on its own

```sh
pnpm --filter @pops/app-purchases dev:standalone   # http://localhost:5570
```

That is the whole setup: no shell, no purchases pillar, no database, no
container. The pages render against fixtures, and it is the same route table
and the same components the shell mounts — there is no standalone-only fork of
anything, which is what makes the harness worth looking at (POPS-3218).

**Mocks are on unless you say otherwise.** `VITE_PURCHASES_API=real` sends the
generated client's requests through the dev server's `/purchases-api` proxy to
a pillar you are running yourself (`pnpm --filter @pops/purchases dev`):

```sh
VITE_PURCHASES_API=real pnpm --filter @pops/app-purchases dev:standalone
```

Nothing else changes between the two modes. A proxy error in the console while
mocked means the switch is set to `real` and the pillar is not up.

### What the mock layer is

`src/standalone/mock/` intercepts `fetch`, not the client. The generated Hey
API client, its serialisers and this app's own error handling all run exactly
as they do against the pillar, so what you are looking at is the shipping code
path rather than a parallel one that can drift from it.

Handlers are keyed by the operations the **OpenAPI document** declares —
`'GET /purchases/{id}'` — rather than by the calls this app happens to make
today. `mock/handlers.test.ts` compares the two sets and fails in both
directions, so a new endpoint cannot ship without an answer here, and a handler
cannot outlive the operation it answered. An operation with no handler returns
a 501 shaped like the contract's own error, which the page renders through its
ordinary error path.

### Adding a fixture

Fixtures live in `src/standalone/fixtures/`, typed against the generated
`*Responses[200]` types, fictional throughout — the convention
`pillars/design/src/fixtures/` follows. Point a handler at one in
`src/standalone/mock/handlers.ts`.

Choose data that makes the page's own reasoning visible rather than the
smallest payload that typechecks. The existing ones are picked that way: the
queue holds a charge nothing can explain, the merchant roll-up holds an
unattributed bucket with a residual, the dictionary holds a product that is
only part-asserted, and the order is short by its shipping. A fixture where
everything reconciles renders a page that looks right and demonstrates nothing.

### Cross-pillar calls

There are none to degrade. Every request this app issues goes to its own
contract; the finance transactions, inventory units and documents it shows are
rendered as the `pops://` references they are and deliberately not resolved
(see "One order" below). The closest thing to a missing sibling is an operation
the harness has no handler for, which reaches the page as an unusable response
the same way — and is covered by `standalone.test.tsx`.

## The reconcile queue

`/purchases` is the reconciliation inbox: one row per purchase charge awaiting
a decision, with the charge on the left, what the engine proposes on the right,
and `Σ proposed − charge` between them.

**The axes are the shipped endpoint's, not the ticket's.** `GET /reconcile/queue`
returns one entry per charge carrying 0..n proposed transactions, so the charge
is the stable side and the transactions are the plural one. Laying it out the
other way would make every row a different height for no gain.

**It is keyboard-driven, and that is the feature.** The queue arrives focused,
so `j`/`k` move the cursor, `enter` accepts and `x` rejects without a click
first. Arrow keys do what `j`/`k` do, because the queue is one `role="listbox"`
and a listbox is expected to answer them. Nothing inside a row is focusable:
interactive children inside a `role="option"` would take focus off the list and
break the bindings after the first click, so the accept/reject buttons live in
a bar above the list and act on the row under the cursor.

**A decision covers every proposal on the charge.** The solver emits several
links for one charge when the charge was settled by a split across
transactions, so those links are one answer rather than competing ones.
Confirming one and leaving the rest would pin half a partition.

### What accepting and rejecting actually persist

This is narrower than POPS-241 describes, and the page says so in its own copy
rather than implying otherwise.

| the view calls it | it calls                  | which does                                                         |
| ----------------- | ------------------------- | ------------------------------------------------------------------ |
| Accept            | `POST /reconcile/confirm` | pins the link, and writes the merchant rule the pin was made under |
| Reject            | `POST /reconcile/unlink`  | deletes the link, and remembers nothing                            |

**The view has not caught up with the server.** `POST /reconcile/reject` now
exists and is the durable decision — it records the pairing so no later sweep
proposes it again — while `unlink` stays deliberately temporary. This page still
calls `unlink`, so its Reject button is still the un-pin rather than the
rejection, and `reconcile.action.caveat` still describes that honestly. Moving
it across, and surfacing the rule a confirm reports back, is POPS-2008.

That is also why the cursor is keyed by charge id and parks on the successor
before the refetch lands, instead of counting indexes: an unlinked charge comes
back as unexplained rather than leaving the queue.

An unexplained charge (no proposals) has nothing to confirm or delete, so both
keys refuse rather than firing a request that would 404. Nothing can link it by
hand yet either — POPS-1900.

### Paging

Reads take the server's 50-row default and the view says when the page came
back full. No offset cursor: confirming drains the queue from underneath the
cursor, so an offset over a shrinking list is the wrong shape.

## The merchant lens

The roll-up layer, and the one step down from it to an order.

`/purchases/merchants` reads `GET /analytics/merchant-spend` and renders one
section per currency, one row per merchant. Three things about it are load
bearing rather than stylistic:

- **The unexplained bucket is always on screen**, including when it is zero.
  Hiding it when there is nothing to report would make its absence mean two
  things at once — "all accounted for" and "this view does not show that" —
  and a reader cannot tell those apart. `residualCents` comes verbatim from
  the server and the explained figure is its complement, never the reverse.
- **The percentage never reads 100% while a residual exists.** A one-cent
  residual against a five-figure total rounds to 100, which is the exact
  false certainty
  [ADR-042](../../../docs/architecture/adr-042-purchase-documents-and-transaction-reconciliation.md)
  refuses one layer down. The share clamps to 99, and is withheld entirely
  when the figures are not a part-of-whole (a negative total, or more linked
  than was ever spent).
- **Merchant attribution is reported, not assumed.** The roll-up groups on a
  resolved entity, on a bare label, or not at all, and the legend on the page
  says what each costs. A label total presented as an entity total is the
  same class of error as a dropped residual, one dimension over.

### Opening a row

A row discloses the orders it was totalled from, each linking to
`/purchases/:purchaseId`. Naming $151.20 as unexplained and leaving no way to
ask which orders it is in was a weaker version of hiding it.

**The request carries the row's own identity, not its label.** The roll-up
groups three ways and `GET /purchases` takes the same three:
`merchantEntityId`, `merchantEntityName`, `merchantUnattributed`. An entity
group is opened by id, and a label group by label — and a label group holds
only the orders that resolved to no entity, which is why the two cannot be
collapsed. Asking for `Woolworths` by label when the row was an entity group
would return every order wearing that label under any entity, and the list
would quietly hold more orders than the row counted.

**Scoped by the window the response reported, not by the picker.** The picker
has already moved while a refetch is in flight, and a list read over one
window under a headline computed over another is a disagreement a reader
cannot see. `currency` travels for the same reason: a merchant billing in two
currencies is two rows, and a request omitting it would answer both with the
same orders.

**Where the two reads disagree, the page says so, and only claims a cause it
has.** A list that came back at the page cap and short of the count is named
as the cap cutting it short; a list short of both is named as the two reads
disagreeing, because nothing on this page established why. None at all is a
disagreement rather than an ordinary empty state — the row exists because the
roll-up counted orders here. More orders than the row counted is reported
too: it is the direction a widened `name` filter would fail in, and a list
quietly holding more than its headline was computed from is the failure the
filter is spelled to prevent.

The tag treemap, the per-item history and the inventory cross-reference the
merchant lens is specified to drill into have no routes behind them. The page
names them as absent rather than rendering an empty panel, which would read
as a statement about the data instead of about the software.

## The receipt drop zone

`/purchases/receipts` is the way in. It posts `POST /receipts` — the pillar's
one intake for merchants that never get a dedicated adapter — and takes all
three shapes that endpoint accepts: a photographed till slip, a PDF tax
invoice, or a pasted order confirmation. Files become base64 parts with no
`data:` prefix, and a pasted body is base64 of its UTF-8 bytes, because the
contract stores every shape one way.

**One receipt can be several parts, and their order is the receipt's.** A long
supermarket slip does not fit in one frame, so up to eight parts are staged
into one upload and one purchase. The staged list is reorderable for that
reason: the server reads the parts top to bottom, and shuffled frames are a
different document. Overflow past the eighth part is reported rather than
trimmed in silence.

**The three outcomes stay three.** `POST /receipts` answers with a
discriminated union and the page keeps the distinction:

| outcome        | what it means                                         | what the page does                                                               |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `created`      | read, and the arithmetic agreed with the stated total | reports the purchase, and says when the bytes were already in the store          |
| `needs-review` | read, and it did not add up — **nothing was written** | lists the gate's objections with the delta each carries, and renders the reading |
| `unreadable`   | nothing usable came back                              | says so, with the reason, and where the upload was stored                        |

`needs-review` is deliberately not dressed as a success. Its whole purpose is
a human comparing the model's reading against the paper, so the extracted
figures are rendered verbatim — unformatted, because a total tidied into
`$41.20` is no longer evidence of what was read — and the delta is shown in
the receipt's own currency, or in bare cents when the receipt named none.

**A 409 is "already recorded", not an error.** The pillar refuses a re-upload
from three places, and the page treats all three the same. Two run before the
model is called — content hash, and the same shop at the same instant and
amount — and carry `code: 'ALREADY_IMPORTED'`. The third is the write itself
rejecting a checksum it already holds, which carries `code:
'DUPLICATE_PURCHASE'`; a second upload reaches it only when the first had not
committed yet, so it is the concurrent case rather than the re-upload-later
one. The page reads the code rather than the HTTP status and renders any of
them as an ordinary outcome. The 409 body carries no purchase, only its id
inside the message, which is shown as sent.

**The created panel opens the order it recorded.** The reader's next question
after "it was read" is always "read as what", and that is the order page.

## One order

`/purchases/:purchaseId` renders `GET /purchases/{id}` whole: the order's
identity, its accounting split, its lines with their tags, units and notes,
its charges with their allocations and links, its deliveries, its documents
and its tags. It is the destination the rest of this app was missing — the
queue, the drop zone and a global-search hit each produce a purchase id, and
each was a dead end while nothing rendered one.

**It carries no rail entry.** Every other route in this app is somewhere a
reader can go from nothing; an order is only reachable from something that
already holds its id, so a nav item pointing here could not be built.

**It does carry a page descriptor, and that is newer than it looks.** While the
shell mounted this app from the bundle map it took the whole `routes` array, so
`pages` only ever needed the rail-reachable four. The runtime loader builds a
pillar's routes from `pages` alone — so without `{ path: ':purchaseId',
bundleSlot: 'purchases-order' }` in `@pops/purchases/manifest`, this page would
simply not exist, and the queue, the drop zone and every search hit would 404
into a rail that looked perfectly correct.

**A line-item search hit lands here at `?item=<id>`.** A line has no page of
its own — the pillar reads one only through its order — so the order is the
page a line has, and the query names which line was asked for. The line is
marked rather than the page being filtered to it: the reader asked about a
line and is being shown the order, and hiding the rest would answer a question
they did not ask. A line the order no longer carries marks nothing and costs
nothing.

**A missing order is not a failure.** `404` renders as "no such order", with
no retry button, because the request worked and the answer was that the order
is gone. Only the other failures get a retry.

**Nothing on this page follows a cross-pillar URI.** A linked transaction, an
inventory unit and a document are rendered as the `pops://` references they
are. This app resolves nothing across that seam, and a link that 404s reads as
a broken page rather than as a reference to something living elsewhere.

**A too-large upload answers the same shape as any other refusal.** The
pillar's `express.json()` limit rejects an oversized body before the contract
ever sees it; `jsonBodyErrorHandler`
(`pillars/purchases/src/api/middleware/json-body-error.ts`) catches that
rejection and answers `413` with the contract's own `{ message, code }` body
instead of Express's default HTML error page, which the generated client
cannot parse into a readable `error`.

**One live region, on the wrapper.** `ReceiptDropZonePage` wraps the whole
outcome panel in a single `aria-live="polite"` region rather than also
marking individual outcomes `role="status"`/`role="alert"` — a live region
nested inside another announces unpredictably in several screen readers. The
wrapper is the one kept because it is the only mechanism that reaches every
outcome (`created`, `duplicate`, `needs-review`, `unreadable` never had a
role of their own; only `uploading` and `refused` did).

## The product dictionary

`/purchases/products` is the correction loop for what the pillar has learned
about product identity. Two of the three shipped adapters state no product
identifier at all, so for their lines a printed wording is the only evidence of
identity there is; `purchase_products` and `purchase_product_aliases` are where
that evidence is written down, and this page is where a person reads it and
takes it back.

**The undo paths are the point, not a footnote.** An entry can be wrong — two
products a merchant prints identically cannot be told apart, which the pillar
states as a limitation rather than a bug — so a dictionary whose corrections
are unreachable does not improve, it drifts. Every write the contract offers is
on the page, each beside the thing it undoes:

| the mistake          | the control                                               |
| -------------------- | --------------------------------------------------------- |
| a wrong merge        | **Give it its own product** — `productId: null`           |
| a wrong confirmation | **Retract** — `confirmed: false`                          |
| a wrong entry        | **Forget this wording** — the lines fall back to the name |
| a wrong product      | **Forget this product** — takes every wording with it     |

**A correction reaches every order already stored, and the page says so.**
Nothing here is written to a line: a product's grouping is resolved fresh on
every read, so pointing two wordings at one product changes what the
product-grain aggregate reports about the past as well as the future — order
counts, cadence and unit-price history are recomputed under the new grouping
the next time anything reads them. Nothing is backfilled because nothing needs
to be. The one thing a correction does **not** revisit is a line's item kind:
that pass writes its decision onto the line and only ever reads unclassified
ones, so a regrouping made afterwards does not re-open a kind already decided.

**Provenance is shown wherever an entry is.** `confirmedAt` is the whole
boundary between a pass and a person, so every wording says which it is, and a
product reads asserted only where **every** wording reaching it was asserted —
the rule `GET /analytics/product-leaderboard` uses one layer down. A product
still holding one proposal reads _part asserted_ and lands on the unfinished
side of the filter, because half a merge presented as a fact is the error the
table was built to prevent.

**Filtering is done over the loaded set, not sent to the server.** `GET
/products` carries no `limit` on purpose — a truncated dictionary is
indistinguishable from one whose missing wordings simply have no entry — so the
read is the whole table, and `product-dictionary/assertion.ts` mirrors
`listProducts`'s own rule against it. That keeps the source picker offering
every source rather than only the ones that survived its last answer, and keeps
the badge and the filter derived from one rule instead of two that can
disagree.

**Not a keyboard inbox.** The reconcile queue is one listbox because its rows
are a keystroke each and hold nothing to click. A correction here picks a target
out of the whole dictionary, so rows carry controls and the list is an ordinary
one. Each control names the wording or product it acts on in its accessible
name — the visible label is just the verb — because a hundred buttons called
"Assert" are indistinguishable to anyone navigating by control.

**Forgetting a product asks twice.** Every other correction is recoverable: the
pass re-mints a forgotten wording, a split undoes a merge. This one takes the
assertions with it, and re-running the pass restores the proposals without the
decisions.

**A rename is protection from the pass, not from a person.** Typing a name
records `labelConfirmedAt` on the product, and the pass holds back every
wording reaching a named product even while those wordings are still
proposals — so a name cannot be lost to a retire, which is the one loss here
no re-run could undo. What still empties a named product is somebody doing it
by hand: forgetting its last wording, or pointing that wording at another
product, leaves nothing resolving to it and the orphan sweep takes it, name
and all. **Forget this wording** is a single click where **Forget this
product** asks twice, so today the shorter path to losing a name is the one
with less ceremony — POPS-2518. The page does not yet distinguish a named
product from a proposal either (POPS-2486).

### Running the pass

The panel at the top runs `POST /products/proposals` and reports its whole
`ProposalOutcome` — lines read, distinct wordings, entries minted, entries
retired, entries left alone. `retired` is reported rather than folded into a
success message: a run takes back the unasserted entries no line prints any
more, which can include a proposal the reader was about to act on. Nothing runs
the pass on a schedule; it runs when the button is pressed.

## Layout

```
src/
  standalone/                      the app on its own: entry, providers, mocks, fixtures
  app-i18n.ts                      the i18n instance for when no shell provides one
  index.ts                         entrypoint — re-exports manifest, navConfig, routes, bundles
  manifest.ts                      ModuleManifest (id='purchases')
  routes.tsx                       the slot→component table, and the routes derived from it
  bundles.ts                       that same table under the name the runtime loader asks for
  remote-entry.ts                  the remote bundle's entry — `bundles` and nothing else
  facts.tsx                        one labelled value, saying what its absence means
  pages/RetryableError.tsx         a read that failed, and the retry it earns
  purchases-api/                   generated Hey API client (do not hand-edit)
  purchases-api-helpers.ts         unwrap() for the generated {data,error} results
  purchases-api-runtime-config.ts  client baseUrl ('/purchases-api')
  pages/
    ReconcileQueuePage.tsx         /purchases — the reconciliation queue
    reconcile/
      types.ts                     view types aliased off the generated client
      money.ts                     the delta's three states
      useReconcileQueue.ts         GET /reconcile/queue
      useReconcileDecisions.ts     confirm/unlink, and what they persist
      useQueueCursor.ts            where the keyboard points
      QueueList.tsx                the listbox and its key bindings
      QueueEntryRow.tsx            one row: charge · delta · proposals
      QueueFilters.tsx             kind + includeAuto
      DecisionBar.tsx              accept/reject, the shortcut hint, the caveat
    MerchantLensPage.tsx           /purchases/merchants — spend per merchant
    merchant-lens/
      types.ts                     view types aliased off the generated client
      period.ts                    the period vocabulary and the window it sends
      explained-split.ts           explained/unexplained, and when a share is meaningful
      useMerchantLensModel.ts      GET /analytics/merchant-spend, folded per currency
      merchant-label.ts            what to call a group, entity id included
      merchant-orders-query.ts     one roll-up row → the order-index request it denotes
      order-count-agreement.ts     how the list stands against the count above it
      useMerchantOrders.ts         GET /purchases, scoped to one merchant group
      CurrencyGroupSection.tsx     one currency, its total, its merchants
      MerchantRow.tsx              one merchant: headline, split, figures, its orders
      MerchantOrders.tsx           the orders behind a row, each opening its own page
      ExplainedSplit.tsx           the split and its meter
      PeriodPicker.tsx             all time, or a year
      AttributionLegend.tsx        what each grouping badge means and costs
      AbsentDrillDown.tsx          the layers with no route behind them
    PurchaseDetailPage.tsx         /purchases/:purchaseId — one order, whole
    purchase-detail/
      types.ts                     view types aliased off the generated client
      usePurchaseDetail.ts         GET /purchases/{id}, and the 404 that is not a failure
      OrderIdentity.tsx            who, when, how it arrived, how it settles
      AccountingSplit.tsx          total · matched · awaiting · unexplained · refunded · net
      LineList.tsx                 the lines, their tags, units and notes
      ChargeList.tsx               charges, their allocations and their transaction links
      DeliveryList.tsx             deliveries, and the documents behind the order
    ReceiptDropZonePage.tsx        /purchases/receipts — hand a receipt over
    receipts/
      types.ts                     view types aliased off the generated client
      parts.ts                     accepted media types, and the staged-part list operations
      encode.ts                    bytes and pasted text → bare base64
      staging.ts                   folding a batch of files into one receipt, bound and all
      useReceiptStaging.ts         the staged parts and what changes them
      useReceiptUpload.ts          POST /receipts, and the 409 that is not a failure
      ReceiptIntake.tsx            drop zone, paste box, staged parts, send
      StagedPartList.tsx           the parts in the order they will be read
      PastedTextForm.tsx           an order confirmation, pasted
      StagingProblems.tsx          what did not become a part, and why
      OutcomePanel.tsx             one panel per outcome, kept apart
      OutcomeParts.tsx             the panel frame, a labelled reading, the stored uris
      ExtractedReading.tsx         what the model read, verbatim
    ProductDictionaryPage.tsx      /purchases/products — the learned dictionary
    product-dictionary/
      types.ts                     view types aliased off the generated client
      assertion.ts                 who owns an entry, and the filter rule it shares
      useProductDictionary.ts      GET /products, whole and unfiltered
      useProposalPass.ts           POST /products/proposals, and what it changed
      useDictionaryEdits.ts        the corrections, and the refetch each one needs
      DictionaryFilters.tsx        source, and which side of the assertion split
      ProposalPassPanel.tsx        running the pass, and reading its outcome
      ProductEntry.tsx             one product, its provenance, its wordings
      ProductLabelEditor.tsx       rename, and the two-step forget
      AliasRow.tsx                 one wording, and every way of correcting it
```

The generated client under `src/purchases-api/` is produced from
`pillars/purchases/openapi/purchases.openapi.json` and must not be edited by
hand. Regenerate it with `generate:purchases-client` after the contract
changes; CI diffs the committed output against a fresh run.

## Run

```sh
pnpm --filter @pops/app-purchases typecheck                 # tsc --noEmit
pnpm --filter @pops/app-purchases test                      # vitest run
pnpm --filter @pops/app-purchases test:watch                # vitest (watch)
pnpm --filter @pops/app-purchases test:coverage             # vitest run --coverage
pnpm --filter @pops/app-purchases generate:purchases-client # regen src/purchases-api
pnpm --filter @pops/app-purchases build                     # dist/remote/purchases.js
pnpm --filter @pops/app-purchases dev:standalone            # the app alone, on mocks
pnpm --filter @pops/app-purchases build:standalone          # the standalone bundle
```

## Install gate

`@pops/app-purchases` exposes a single `.` export — `manifest`, `navConfig`,
`routes` and `bundles`, all browser-safe. `pillars/shell` imports the `manifest` and
gates mounting on its `POPS_APPS` selection: adding `purchases` mounts the
module at `/purchases`, removing it hides those routes. No data lives in this
package, so uninstalling only removes the UI — purchase data stays in the
purchases pillar.

## Docs

- Pillar overview: [`pillars/purchases/README.md`](../README.md)

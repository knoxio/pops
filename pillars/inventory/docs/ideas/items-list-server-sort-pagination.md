# Idea: Server-driven sort + URL-persisted pagination for the items list

The items list page sorts and paginates **client-side**: it fetches up to
`limit: 200` items in one `GET /items` call and lets the shared `DataTable`
(tanstack-table) handle column sorting and a `defaultPageSize: 20` pager in the
browser. That breaks down once a library exceeds ~200 items, and neither the
sort column/direction nor the page survive a reload or a shared link.

Build later:

- **Contract**: add `sort` (`name | brand | location | value | purchaseDate`)
  and `direction` (`asc | desc`) query params to `GET /items` in
  `rest-items.ts`, and apply the ordering in the items API handler. Default to
  `name asc`.
- **Pagination**: the contract already returns `limit`/`offset` + `pagination`
  meta — wire the page to drive `limit`/`offset` from real pager state instead
  of hard-coding `limit: 200`, and surface a page-size selector.
- **URL persistence**: mirror `sort`, `direction`, `page`, and `pageSize` into
  URL query params alongside the existing `q`/`type`/`condition`/`inUse`/
  `locationId`, so the active sort and page are bookmarkable and back/forward
  works. Changing any filter resets to page 1.

Forward-looking only — not built. Carved out of the original Items List PRD,
which assumed server-side sort/pagination and URL-persisted sort state; the
shipped page does both client-side over a single 200-row fetch.

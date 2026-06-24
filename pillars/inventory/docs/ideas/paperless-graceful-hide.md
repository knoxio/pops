# Idea: Fully hide the Documents section when Paperless is unreachable

Today the item-detail Documents section degrades in two steps based on `GET /paperless/status`:

- `configured: false` ⇒ renders nothing (correct).
- `configured: true, available: false` ⇒ still renders the "Documents" header plus a "Paperless-ngx unavailable" line.

The visible "unavailable" line is arguably noise on an item that may have no documents at all. A cleaner degradation is to render nothing whenever `available` is false (whether or not it is configured), so a transient Paperless outage leaves no dead UI on the item page. The trade-off: a configured-but-down instance gives the user no signal that documents exist but can't be shown.

Decide the desired behaviour (silent-hide vs. keep-the-breadcrumb) and, if silent-hide wins, collapse the `!status.available` branch in `DocumentsSection` to return `null`.

Scope: frontend only.

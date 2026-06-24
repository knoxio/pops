# Idea: Confirm before unlinking a Paperless document

The item-detail Documents section unlinks a document immediately on clicking the unlink (X) button — `DocumentRow` calls `onUnlink(doc.id)` with no intermediate confirmation. An accidental click silently drops the link (recoverable only by re-searching and re-linking).

Add a confirmation step before `DELETE /documents/:id`, e.g. an inline confirm or a small dialog reading "Unlink <title>?" with cancel/confirm, mirroring the destructive-action pattern used elsewhere in the pillar. Keep the optimistic toast + list refresh on confirm.

Scope: frontend only — the `DELETE /documents/:id` contract is unchanged.

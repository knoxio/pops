import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Badge,
  Input,
} from "@pops/ui";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";
import type { AppRouter } from "@pops/api-client";
import { trpc } from "../../lib/trpc";
import { useImportStore } from "../../store/importStore";
import type { CorrectionRule } from "./RulePicker";
import { computeMergedRules } from "../../lib/merged-state";
import {
  AiHelperPanel,
  BrowseRuleDetailPanel,
  ContextPanel,
  DetailPanel,
  ImpactPanel,
  OpsListPanel,
  RejectPanel,
  type AiMessage,
  type PreviewView,
} from "./CorrectionProposalDialogPanels";

// ---------------------------------------------------------------------------
// tRPC type helpers
// ---------------------------------------------------------------------------

export type CorrectionSignal =
  inferRouterInputs<AppRouter>["core"]["corrections"]["proposeChangeSet"]["signal"];
export type PreviewChangeSetOutput =
  inferRouterOutputs<AppRouter>["core"]["corrections"]["previewChangeSet"];
type ProposeChangeSetOutput =
  inferRouterOutputs<AppRouter>["core"]["corrections"]["proposeChangeSet"];
type ServerChangeSet = ProposeChangeSetOutput["changeSet"];
type ServerChangeSetOp = ServerChangeSet["ops"][number];
export type AddRuleData = Extract<ServerChangeSetOp, { op: "add" }>["data"];
export type EditRuleData = Extract<ServerChangeSetOp, { op: "edit" }>["data"];

// ---------------------------------------------------------------------------
// Normalization helpers (reused by tests)
// ---------------------------------------------------------------------------

/** Client-side mirror of the server's normalizeDescription (corrections/types.ts).
 *  Uppercases, strips digits, collapses whitespace. Duplicated here to avoid
 *  pulling server code into the frontend bundle. */
export function normalizeForMatch(value: string): string {
  return value.toUpperCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Mirror the server matcher in `findMatchingCorrectionFromRules` / the
 * preview pipeline. Semantics:
 *  - For `exact`/`contains`: both sides are normalized via `normalizeForMatch`
 *    (patterns are stored already-normalized in the DB, but we normalize the
 *    client-side pattern too because the user can type a raw value in the
 *    detail editor before the server has a chance to normalize it).
 *  - For `regex`: pattern is kept raw (server stores regex patterns raw) and
 *    tested with `new RegExp(pattern)` — **no `i` flag** — against the
 *    *normalized* description. Using the `i` flag here, or testing against
 *    the raw description, would silently diverge from what the server preview
 *    engine matches and scope out transactions that actually hit on apply.
 */
export function transactionMatchesSignal(
  description: string,
  pattern: string,
  matchType: "exact" | "contains" | "regex"
): boolean {
  const normDesc = normalizeForMatch(description);
  if (matchType === "regex") {
    if (pattern.length === 0) return false;
    try {
      return new RegExp(pattern).test(normDesc);
    } catch {
      return false;
    }
  }
  const normPattern = normalizeForMatch(pattern);
  if (!normPattern) return false;
  if (matchType === "exact") return normDesc === normPattern;
  return normDesc.includes(normPattern);
}

/**
 * Server-side cap on `transactions` in `core.corrections.previewChangeSet`
 * (enforced by a zod `.max(2000)`). We mirror it here so the dialog never
 * ships a request that will be rejected. If the user imports more rows than
 * this, we slice the scoped list and surface a "preview truncated" hint in
 * the impact panel so they know the delta numbers are an under-count, not
 * the full picture.
 */
export const PREVIEW_CHANGESET_MAX_TRANSACTIONS = 2000;

interface ScopedPreviewTxnResult<T> {
  txns: T[];
  truncated: boolean;
}

/**
 * Build the scoped transaction list to feed into `previewChangeSet`. For
 * each op in the ChangeSet, keep any transaction whose description would
 * actually be matched by that op (so previews aren't polluted with rows
 * that don't interact with this edit). For `edit`/`disable`/`remove` ops
 * we rely on the hydrated `targetRule`; if hydration is missing for any
 * non-`add` op we bail out of scoping for that entire preview and fall
 * through to the full `previewTransactions` list — otherwise the op's
 * real impact would be invisible in the preview panel.
 *
 * After scoping, the result is hard-capped at
 * `PREVIEW_CHANGESET_MAX_TRANSACTIONS` so we never trip the server zod
 * limit. `truncated === true` if that cap kicked in.
 *
 * Exported for unit testing.
 */
export function scopePreviewTransactions<T extends { description: string }>(
  ops: LocalOp[],
  previewTransactions: readonly T[]
): ScopedPreviewTxnResult<T> {
  const hasUnscopedRuleOp = ops.some((op) => op.kind !== "add" && !op.targetRule);
  const filtered = hasUnscopedRuleOp
    ? [...previewTransactions]
    : previewTransactions.filter((t) =>
        ops.some((op) => {
          if (op.kind === "add") {
            return transactionMatchesSignal(
              t.description,
              op.data.descriptionPattern,
              op.data.matchType
            );
          }
          const rule = op.targetRule;
          if (!rule) return false;
          return transactionMatchesSignal(t.description, rule.descriptionPattern, rule.matchType);
        })
      );

  if (filtered.length <= PREVIEW_CHANGESET_MAX_TRANSACTIONS) {
    return { txns: filtered, truncated: false };
  }
  return {
    txns: filtered.slice(0, PREVIEW_CHANGESET_MAX_TRANSACTIONS),
    truncated: true,
  };
}

// ---------------------------------------------------------------------------
// Local op model
// ---------------------------------------------------------------------------

/**
 * Client-side representation of a ChangeSet operation. Distinct from the server
 * schema because we need:
 *  - a stable `clientId` for React keys and selection (the server `add` op has
 *    no id; `edit`/`disable`/`remove` ids would collide if the user stacks two
 *    ops against the same rule)
 *  - a `dirty` flag to drive the staleness gate for Apply
 *  - a snapshot of the target rule for edit/disable/remove, so the detail panel
 *    can render rule context without re-fetching
 */
export type LocalOp =
  | {
      kind: "add";
      clientId: string;
      data: AddRuleData;
      dirty: boolean;
    }
  | {
      kind: "edit";
      clientId: string;
      targetRuleId: string;
      targetRule: CorrectionRule | null;
      data: EditRuleData;
      dirty: boolean;
    }
  | {
      kind: "disable";
      clientId: string;
      targetRuleId: string;
      targetRule: CorrectionRule | null;
      rationale: string;
      dirty: boolean;
    }
  | {
      kind: "remove";
      clientId: string;
      targetRuleId: string;
      targetRule: CorrectionRule | null;
      rationale: string;
      dirty: boolean;
    };

export type OpKind = LocalOp["kind"];

let clientIdCounter = 0;
function newClientId(prefix: OpKind): string {
  clientIdCounter += 1;
  return `${prefix}-${clientIdCounter}-${Date.now().toString(36)}`;
}

/**
 * Convert a server ChangeSet op into its client-side counterpart. For
 * `edit`/`disable`/`remove` ops we hydrate `targetRule` from the
 * `targetRules` map returned alongside the proposal (or revise) response
 * so the preview-scoping filter in the dialog can correctly match
 * existing-rule patterns against the current import's transactions.
 *
 * If the lookup misses (shouldn't happen for server-issued ops, but can
 * for forward-compatibility), we leave `targetRule` as `null` and the
 * preview-scoping effect downstream falls back to using the full
 * `previewTransactions` list for that op.
 */
export function serverOpToLocalOp(
  op: ServerChangeSetOp,
  targetRules: Record<string, CorrectionRule>
): LocalOp {
  if (op.op === "add") {
    return { kind: "add", clientId: newClientId("add"), data: op.data, dirty: false };
  }
  const hydrated = targetRules[op.id] ?? null;
  if (op.op === "edit") {
    return {
      kind: "edit",
      clientId: newClientId("edit"),
      targetRuleId: op.id,
      targetRule: hydrated,
      data: op.data,
      dirty: false,
    };
  }
  if (op.op === "disable") {
    return {
      kind: "disable",
      clientId: newClientId("disable"),
      targetRuleId: op.id,
      targetRule: hydrated,
      rationale: "",
      dirty: false,
    };
  }
  return {
    kind: "remove",
    clientId: newClientId("remove"),
    targetRuleId: op.id,
    targetRule: hydrated,
    rationale: "",
    dirty: false,
  };
}

function localOpToServerOp(op: LocalOp): ServerChangeSetOp {
  if (op.kind === "add") return { op: "add", data: op.data };
  if (op.kind === "edit") return { op: "edit", id: op.targetRuleId, data: op.data };
  if (op.kind === "disable") return { op: "disable", id: op.targetRuleId };
  return { op: "remove", id: op.targetRuleId };
}

function localOpsToChangeSet(
  ops: LocalOp[],
  extras?: { source?: string; reason?: string }
): ServerChangeSet | null {
  if (ops.length === 0) return null;
  return {
    source: extras?.source ?? "correction-proposal-dialog",
    reason: extras?.reason,
    ops: ops.map(localOpToServerOp),
  };
}

export function opKindLabel(kind: OpKind): string {
  if (kind === "add") return "Add rule";
  if (kind === "edit") return "Edit rule";
  if (kind === "disable") return "Disable rule";
  return "Remove rule";
}

export function opKindBadgeVariant(
  kind: OpKind
): "default" | "secondary" | "outline" | "destructive" {
  if (kind === "add") return "default";
  if (kind === "edit") return "secondary";
  if (kind === "disable") return "outline";
  return "destructive";
}

export function opSummary(op: LocalOp): string {
  if (op.kind === "add") {
    const pat = op.data.descriptionPattern || "(no pattern)";
    const outcome = op.data.entityName ?? op.data.transactionType ?? "unclassified";
    return `${pat} → ${outcome}`;
  }
  const pat = op.targetRule?.descriptionPattern ?? "(rule)";
  if (op.kind === "edit") {
    const outcome = op.data.entityName ?? op.data.transactionType ?? "edit";
    return `${pat} → ${outcome}`;
  }
  if (op.kind === "disable") return `${pat} (disable)`;
  return `${pat} (remove)`;
}

export function matchTypeLabel(matchType: "exact" | "contains" | "regex"): string {
  if (matchType === "exact") return "matches exactly";
  if (matchType === "contains") return "contains";
  return "matches regex";
}

// ---------------------------------------------------------------------------
// Default op factory
// ---------------------------------------------------------------------------

function newAddOpFromSignal(signal: CorrectionSignal): LocalOp {
  return {
    kind: "add",
    clientId: newClientId("add"),
    data: {
      descriptionPattern: signal.descriptionPattern,
      matchType: signal.matchType,
      entityId: signal.entityId ?? undefined,
      entityName: signal.entityName ?? undefined,
      location: signal.location ?? undefined,
      tags: signal.tags ?? [],
      transactionType: signal.transactionType ?? undefined,
    },
    dirty: true,
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * The transaction that triggered this proposal, plus the user's pre-correction
 * snapshot. Rendered prominently so the reviewer can reason about why the
 * proposed rule is shaped the way it is — without the raw description the
 * reviewer cannot tell whether a bad pattern is the AI's fault or theirs.
 */
export interface TriggeringTransactionContext {
  description: string;
  amount: number;
  date: string;
  account: string;
  location?: string | null;
  previousEntityName?: string | null;
  previousTransactionType?: "purchase" | "transfer" | "income" | null;
}

export interface CorrectionProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  signal: CorrectionSignal | null;
  /** The transaction the user just corrected (raw description, amount, etc.) */
  triggeringTransaction: TriggeringTransactionContext | null;
  /** Import-session descriptions used for deterministic previewChangeSet.
   *  The dialog scopes previews to only those matching any rule in the
   *  current ChangeSet before sending. */
  previewTransactions: Array<{ checksum?: string; description: string }>;
  minConfidence?: number;
  onApproved?: (changeSet: ServerChangeSet) => void;
  /** Dialog mode: 'proposal' (default) shows the AI proposal flow;
   *  'browse' shows all rules for manual CRUD management. */
  mode?: "proposal" | "browse";
  /** Called when browse mode closes with pending changes committed.
   *  The parent can trigger re-evaluation. */
  onBrowseClose?: (hadChanges: boolean) => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CorrectionProposalDialog(props: CorrectionProposalDialogProps) {
  const minConfidence = props.minConfidence ?? 0.7;
  const isBrowseMode = props.mode === "browse";

  // ---- local state --------------------------------------------------------
  const [localOps, setLocalOps] = useState<LocalOp[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [previewView, setPreviewView] = useState<PreviewView>("selected");

  const [combinedPreview, setCombinedPreview] = useState<PreviewChangeSetOutput | null>(null);
  const [combinedPreviewError, setCombinedPreviewError] = useState<string | null>(null);
  const [combinedPreviewTruncated, setCombinedPreviewTruncated] = useState(false);

  const [selectedOpPreview, setSelectedOpPreview] = useState<PreviewChangeSetOutput | null>(null);
  const [selectedOpPreviewError, setSelectedOpPreviewError] = useState<string | null>(null);
  const [selectedOpPreviewTruncated, setSelectedOpPreviewTruncated] = useState(false);
  const selectedOpPreviewKey = useRef<string | null>(null);

  const [rejectMode, setRejectMode] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");

  const [aiInstruction, setAiInstruction] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  const [rationale, setRationale] = useState<string | null>(null);

  // ---- browse mode state --------------------------------------------------
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseSelectedRuleId, setBrowseSelectedRuleId] = useState<string | null>(null);
  /** Snapshot of pendingChangeSets length when browse mode opened — used to
   *  detect whether the user made changes during this session. */
  const browseInitialPendingCountRef = useRef<number>(0);

  const pendingChangeSets = useImportStore((s) => s.pendingChangeSets);
  const addPendingChangeSet = useImportStore((s) => s.addPendingChangeSet);

  // Fetch all rules only in browse mode
  // TODO: add pagination or "load more" if rule counts grow beyond 500
  const browseListQuery = trpc.core.corrections.list.useQuery(
    { limit: 500, offset: 0 },
    { enabled: isBrowseMode && props.open, staleTime: 30_000 }
  );

  const browseDbRules = browseListQuery.data?.data ?? [];

  /** Merged rules: DB rules + pending ChangeSets applied in order.
   *  CorrectionRule (tRPC output) and CorrectionRow are structurally
   *  compatible for merge — the extra fields (isActive, priority) are
   *  preserved through the fold. We cast to satisfy the function signature.
   *  TODO: add a shared adapter or structural type test to catch silent drift. */
  const browseMergedRules: CorrectionRule[] = useMemo(() => {
    if (!isBrowseMode) return [];
    if (pendingChangeSets.length === 0) return browseDbRules;
    return computeMergedRules(
      browseDbRules as unknown as Parameters<typeof computeMergedRules>[0],
      pendingChangeSets
    ) as unknown as CorrectionRule[];
  }, [isBrowseMode, browseDbRules, pendingChangeSets]);

  const browseFilteredRules = useMemo(() => {
    const needle = browseSearch.trim().toLowerCase();
    if (!needle) return browseMergedRules;
    return browseMergedRules.filter((r) => {
      const haystack =
        `${r.descriptionPattern} ${r.entityName ?? ""} ${r.matchType} ${r.location ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [browseMergedRules, browseSearch]);

  const browseSelectedRule = useMemo(
    () => browseMergedRules.find((r) => r.id === browseSelectedRuleId) ?? null,
    [browseMergedRules, browseSelectedRuleId]
  );

  // Seed browseInitialPendingCount when dialog opens in browse mode
  useEffect(() => {
    if (isBrowseMode && props.open) {
      browseInitialPendingCountRef.current = useImportStore.getState().pendingChangeSets.length;
    }
  }, [isBrowseMode, props.open]);

  const selectedOp = useMemo(
    () => localOps.find((o) => o.clientId === selectedClientId) ?? null,
    [localOps, selectedClientId]
  );

  const hasDirty = useMemo(() => localOps.some((o) => o.dirty), [localOps]);

  // ---- initial propose query ---------------------------------------------

  const disabledSignal: CorrectionSignal = useMemo(
    () => ({ descriptionPattern: "_", matchType: "exact", tags: [] }),
    []
  );

  const proposeInput = useMemo(() => {
    if (!props.signal) return null;
    return { signal: props.signal, minConfidence, maxPreviewItems: 200 };
  }, [props.signal, minConfidence]);

  const proposeQuery = trpc.core.corrections.proposeChangeSet.useQuery(
    proposeInput ?? { signal: disabledSignal, minConfidence, maxPreviewItems: 200 },
    {
      enabled: Boolean(!isBrowseMode && props.open && proposeInput),
      staleTime: 0,
      retry: false,
    }
  );

  // Seed localOps from the initial proposal exactly once per open. We track
  // a "seeded" ref so re-renders of the same query result don't wipe user
  // edits.
  const seededForSignalRef = useRef<string | null>(null);
  useEffect(() => {
    if (!props.open) {
      seededForSignalRef.current = null;
      return;
    }
    const data = proposeQuery.data;
    if (!data) return;
    const signalKey = JSON.stringify(props.signal);
    if (seededForSignalRef.current === signalKey) return;
    seededForSignalRef.current = signalKey;

    const seeded = data.changeSet.ops.map((o) => serverOpToLocalOp(o, data.targetRules ?? {}));
    // Mark all as clean because the combined preview we're about to run
    // reflects exactly these ops.
    const clean = seeded.map((o) => ({ ...o, dirty: false }));
    setLocalOps(clean);
    setSelectedClientId(clean[0]?.clientId ?? null);
    setRationale(data.rationale ?? null);
    setCombinedPreview(null);
    setCombinedPreviewError(null);
    setCombinedPreviewTruncated(false);
    setSelectedOpPreview(null);
    setSelectedOpPreviewError(null);
    setSelectedOpPreviewTruncated(false);
    selectedOpPreviewKey.current = null;
  }, [props.open, props.signal, proposeQuery.data]);

  // ---- preview mutation ---------------------------------------------------

  const previewMutation = trpc.core.corrections.previewChangeSet.useMutation({
    retry: false,
  });
  // Destructure the stable mutation function. react-query guarantees
  // mutateAsync is reference-stable across renders, so depending on it in
  // effects is safe; depending on the wrapping `previewMutation` object would
  // re-trigger effects on every render and cause infinite loops.
  const previewMutateAsync = previewMutation.mutateAsync;

  const EMPTY_PREVIEW_SUMMARY = useMemo(
    () => ({
      total: 0,
      newMatches: 0,
      removedMatches: 0,
      statusChanges: 0,
      netMatchedDelta: 0,
    }),
    []
  );

  /**
   * Force-rerun handle: bump this token to re-trigger the combined/selected
   * preview effects without making a structural change to localOps. The
   * Re-run preview button in the impact panel uses it.
   */
  const [rerunToken, setRerunToken] = useState(0);

  // Auto-run combined preview on structural changes (op add/delete/wholesale
  // replace) or when the user explicitly asks for a rerun. Intentionally does
  // NOT run on every field edit — those mark the ChangeSet stale and require
  // the user to click Re-run preview.
  const lastCombinedStructuralSig = useRef<string | null>(null);
  const lastCombinedRerunToken = useRef<number>(0);
  const lastSelectedRerunToken = useRef<number>(0);
  useEffect(() => {
    if (!props.open) {
      lastCombinedStructuralSig.current = null;
      return;
    }
    if (localOps.length === 0) return;
    const sig = localOps.map((o) => o.clientId).join("|");
    // Skip if neither the structural sig nor the manual rerun token has
    // changed since we last ran. This guards against re-runs caused by
    // unrelated state updates while still letting Re-run preview force a
    // refresh after the user has only edited fields.
    if (
      lastCombinedStructuralSig.current === sig &&
      lastCombinedRerunToken.current === rerunToken
    ) {
      return;
    }
    lastCombinedStructuralSig.current = sig;
    lastCombinedRerunToken.current = rerunToken;

    const ops = localOps;
    const changeSet = localOpsToChangeSet(ops);
    if (!changeSet) return;

    // Scope + cap via shared helper so we stay under the server's
    // `.max(2000)` zod limit and reuse the hydrated-targetRule fallback.
    const { txns, truncated } = scopePreviewTransactions(ops, props.previewTransactions);
    setCombinedPreviewTruncated(truncated);

    if (txns.length === 0) {
      setCombinedPreview({ diffs: [], summary: EMPTY_PREVIEW_SUMMARY });
      setCombinedPreviewError(null);
      setLocalOps((prev) => prev.map((o) => (o.dirty ? { ...o, dirty: false } : o)));
      return;
    }

    let cancelled = false;
    previewMutateAsync({
      changeSet,
      transactions: txns,
      minConfidence,
      pendingChangeSets:
        pendingChangeSets.length > 0
          ? pendingChangeSets.map((pcs) => ({ changeSet: pcs.changeSet }))
          : undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setCombinedPreview(res);
        setCombinedPreviewError(null);
        setLocalOps((prev) => prev.map((o) => (o.dirty ? { ...o, dirty: false } : o)));
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Preview failed";
        setCombinedPreviewError(message);
        setCombinedPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    props.open,
    localOps,
    rerunToken,
    props.previewTransactions,
    minConfidence,
    previewMutateAsync,
    pendingChangeSets,
    EMPTY_PREVIEW_SUMMARY,
  ]);

  // Auto-run selected-op preview when the selected clientId changes to one we
  // haven't previewed yet. We key the cache by clientId alone; field edits
  // won't trigger a rerun (staleness is shown visually, and Re-run preview
  // covers both panels).
  useEffect(() => {
    if (!props.open) return;
    if (!selectedOp) {
      setSelectedOpPreview(null);
      setSelectedOpPreviewError(null);
      selectedOpPreviewKey.current = null;
      return;
    }
    if (
      selectedOpPreviewKey.current === selectedOp.clientId &&
      lastSelectedRerunToken.current === rerunToken
    ) {
      return;
    }
    selectedOpPreviewKey.current = selectedOp.clientId;
    lastSelectedRerunToken.current = rerunToken;

    const op = selectedOp;
    const changeSet = localOpsToChangeSet([op]);
    if (!changeSet) return;

    const { txns, truncated } = scopePreviewTransactions([op], props.previewTransactions);
    setSelectedOpPreviewTruncated(truncated);

    if (txns.length === 0) {
      setSelectedOpPreview({ diffs: [], summary: EMPTY_PREVIEW_SUMMARY });
      setSelectedOpPreviewError(null);
      return;
    }

    let cancelled = false;
    const previewKey = op.clientId;
    previewMutateAsync({
      changeSet,
      transactions: txns,
      minConfidence,
      pendingChangeSets:
        pendingChangeSets.length > 0
          ? pendingChangeSets.map((pcs) => ({ changeSet: pcs.changeSet }))
          : undefined,
    })
      .then((res) => {
        if (cancelled) return;
        if (selectedOpPreviewKey.current !== previewKey) return;
        setSelectedOpPreview(res);
        setSelectedOpPreviewError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (selectedOpPreviewKey.current !== previewKey) return;
        const message = err instanceof Error ? err.message : "Preview failed";
        setSelectedOpPreviewError(message);
        setSelectedOpPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    props.open,
    selectedOp,
    rerunToken,
    props.previewTransactions,
    minConfidence,
    previewMutateAsync,
    pendingChangeSets,
    EMPTY_PREVIEW_SUMMARY,
  ]);

  // ---- apply / reject mutations ------------------------------------------

  const handleApplyLocal = useCallback(
    (changeSet: ServerChangeSet) => {
      try {
        addPendingChangeSet({ changeSet, source: "correction-proposal" });
        toast.success("Rules applied locally");
        props.onApproved?.(changeSet);
        handleOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to apply rules");
      }
    },
    [addPendingChangeSet, props, handleOpenChange]
  );

  const rejectMutation = trpc.core.corrections.rejectChangeSet.useMutation({
    onSuccess: () => {
      toast.success("Proposal rejected — feedback recorded");
      handleOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const reviseMutation = trpc.core.corrections.reviseChangeSet.useMutation({
    retry: false,
  });
  const reviseMutateAsync = reviseMutation.mutateAsync;

  const isBusy =
    proposeQuery.isFetching || previewMutation.isPending || rejectMutation.isPending || aiBusy;

  const canApply =
    !isBusy &&
    localOps.length > 0 &&
    !hasDirty &&
    Boolean(props.sessionId) &&
    !combinedPreviewError;

  // ---- handlers -----------------------------------------------------------

  const updateOp = useCallback((clientId: string, mutator: (op: LocalOp) => LocalOp) => {
    setLocalOps((prev) =>
      prev.map((o) => (o.clientId === clientId ? { ...mutator(o), dirty: true } : o))
    );
  }, []);

  const handleDeleteOp = useCallback(
    (clientId: string) => {
      setLocalOps((prev) => prev.filter((o) => o.clientId !== clientId));
      setSelectedClientId((prevSelected) => {
        if (prevSelected !== clientId) return prevSelected;
        const remaining = localOps.filter((o) => o.clientId !== clientId);
        return remaining[0]?.clientId ?? null;
      });
    },
    [localOps]
  );

  const handleAddNewRuleOp = useCallback(() => {
    if (isBrowseMode) {
      // In browse mode, create a blank add op
      const newOp: LocalOp = {
        kind: "add",
        clientId: newClientId("add"),
        data: {
          descriptionPattern: "",
          matchType: "contains",
          tags: [],
        },
        dirty: true,
      };
      setLocalOps((prev) => [...prev, newOp]);
      setSelectedClientId(newOp.clientId);
      return;
    }
    if (!props.signal) return;
    const newOp = newAddOpFromSignal(props.signal);
    setLocalOps((prev) => [...prev, newOp]);
    setSelectedClientId(newOp.clientId);
  }, [props.signal, isBrowseMode]);

  const handleAddTargetedOp = useCallback(
    (kind: "edit" | "disable" | "remove", rule: CorrectionRule) => {
      let newOp: LocalOp;
      if (kind === "edit") {
        newOp = {
          kind: "edit",
          clientId: newClientId("edit"),
          targetRuleId: rule.id,
          targetRule: rule,
          data: {
            entityId: rule.entityId ?? undefined,
            entityName: rule.entityName ?? undefined,
            location: rule.location ?? undefined,
            tags: rule.tags,
            transactionType: rule.transactionType ?? undefined,
            isActive: rule.isActive,
            confidence: rule.confidence,
          },
          dirty: true,
        };
      } else if (kind === "disable") {
        newOp = {
          kind: "disable",
          clientId: newClientId("disable"),
          targetRuleId: rule.id,
          targetRule: rule,
          rationale: "",
          dirty: true,
        };
      } else {
        newOp = {
          kind: "remove",
          clientId: newClientId("remove"),
          targetRuleId: rule.id,
          targetRule: rule,
          rationale: "",
          dirty: true,
        };
      }
      setLocalOps((prev) => [...prev, newOp]);
      setSelectedClientId(newOp.clientId);
    },
    []
  );

  const handleRerunPreview = useCallback(() => {
    // Bumping rerunToken forces both auto-preview effects to re-execute even
    // when their structural/selection signature hasn't changed (e.g. after a
    // pure field edit). The effects compare the current token against a ref
    // of the last token they processed.
    setRerunToken((t) => t + 1);
  }, []);

  const handleApprove = useCallback(() => {
    const changeSet = localOpsToChangeSet(localOps);
    if (!changeSet) return;
    handleApplyLocal(changeSet);
  }, [localOps, handleApplyLocal]);

  const handleConfirmReject = useCallback(() => {
    if (!props.signal) return;
    const changeSet = localOpsToChangeSet(localOps);
    if (!changeSet) return;
    const trimmed = rejectFeedback.trim();
    if (!trimmed) return;
    rejectMutation.mutate({
      signal: props.signal,
      changeSet,
      feedback: trimmed,
      impactSummary: combinedPreview?.summary ?? undefined,
    });
  }, [props.signal, localOps, rejectFeedback, combinedPreview, rejectMutation]);

  /**
   * AI helper submit. Sends the current ChangeSet, the triggering signal, and
   * the user instruction to `core.corrections.reviseChangeSet`. The response is
   * a fully revised ChangeSet which we splice back into local state — never
   * applied automatically. The user must still click Apply.
   */
  const handleAiSubmit = useCallback(() => {
    const instruction = aiInstruction.trim();
    if (!instruction) return;
    if (!props.signal) return;
    const currentChangeSet = localOpsToChangeSet(localOps);
    if (!currentChangeSet) {
      toast.error(
        "ChangeSet is empty — add at least one operation before asking the AI to revise."
      );
      return;
    }

    const userMsgId = `u-${Date.now()}`;
    setAiMessages((prev) => [...prev, { id: userMsgId, role: "user", text: instruction }]);
    setAiInstruction("");
    setAiBusy(true);

    reviseMutateAsync({
      signal: props.signal,
      currentChangeSet,
      instruction,
      triggeringTransactions: props.previewTransactions.slice(0, 100),
    })
      .then((res) => {
        const revised = res.changeSet.ops.map((o) => serverOpToLocalOp(o, res.targetRules ?? {}));
        setLocalOps(revised);
        setSelectedClientId(revised[0]?.clientId ?? null);
        setRationale(res.rationale ?? null);
        // Force previews to re-run against the new ChangeSet structure.
        lastCombinedStructuralSig.current = null;
        selectedOpPreviewKey.current = null;
        setAiMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: res.rationale ?? "ChangeSet revised.",
          },
        ]);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "AI helper failed";
        setAiMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: `Error: ${message}`,
          },
        ]);
        toast.error(message);
      })
      .finally(() => {
        setAiBusy(false);
      });
  }, [aiInstruction, props.signal, props.previewTransactions, localOps, reviseMutateAsync]);

  // ---- browse mode: load rule into editor ----------------------------------
  const handleBrowseSelectRule = useCallback(
    (ruleId: string) => {
      setBrowseSelectedRuleId(ruleId);
      // If there's already a pending localOp editing this rule, select it
      const existingOp = localOps.find((o) => o.kind !== "add" && o.targetRuleId === ruleId);
      if (existingOp) {
        setSelectedClientId(existingOp.clientId);
      } else {
        setSelectedClientId(null);
      }
    },
    [localOps]
  );

  const handleBrowseEditRule = useCallback((rule: CorrectionRule) => {
    const newOp: LocalOp = {
      kind: "edit",
      clientId: newClientId("edit"),
      targetRuleId: rule.id,
      targetRule: rule,
      data: {
        entityId: rule.entityId ?? undefined,
        entityName: rule.entityName ?? undefined,
        location: rule.location ?? undefined,
        tags: rule.tags,
        transactionType: rule.transactionType ?? undefined,
        isActive: rule.isActive,
        confidence: rule.confidence,
      },
      dirty: true,
    };
    setLocalOps((prev) => [...prev, newOp]);
    setSelectedClientId(newOp.clientId);
  }, []);

  const handleBrowseDisableRule = useCallback((rule: CorrectionRule) => {
    const newOp: LocalOp = {
      kind: "disable",
      clientId: newClientId("disable"),
      targetRuleId: rule.id,
      targetRule: rule,
      rationale: "",
      dirty: true,
    };
    setLocalOps((prev) => [...prev, newOp]);
    setSelectedClientId(newOp.clientId);
  }, []);

  const handleBrowseRemoveRule = useCallback((rule: CorrectionRule) => {
    const newOp: LocalOp = {
      kind: "remove",
      clientId: newClientId("remove"),
      targetRuleId: rule.id,
      targetRule: rule,
      rationale: "",
      dirty: true,
    };
    setLocalOps((prev) => [...prev, newOp]);
    setSelectedClientId(newOp.clientId);
  }, []);

  /** Commit current localOps as a PendingChangeSet and close. */
  const handleBrowseSave = useCallback(() => {
    if (localOps.length === 0) {
      handleOpenChange(false);
      return;
    }
    const changeSet = localOpsToChangeSet(localOps, { source: "browse-rule-manager" });
    if (changeSet) {
      addPendingChangeSet({ changeSet, source: "browse-rule-manager" });
      toast.success(`${localOps.length} rule change${localOps.length === 1 ? "" : "s"} saved`);
    }
    // handleOpenChange will detect the count change via onBrowseClose
    handleOpenChange(false);
  }, [localOps, addPendingChangeSet]);

  function handleOpenChange(open: boolean) {
    if (!open && isBrowseMode) {
      const currentCount = useImportStore.getState().pendingChangeSets.length;
      const hadChanges = currentCount !== browseInitialPendingCountRef.current;
      // Reset browse-specific state
      setBrowseSearch("");
      setBrowseSelectedRuleId(null);
      setLocalOps([]);
      setSelectedClientId(null);
      props.onOpenChange(false);
      props.onBrowseClose?.(hadChanges);
      return;
    }
    props.onOpenChange(open);
    if (!open) {
      setLocalOps([]);
      setSelectedClientId(null);
      setPreviewView("selected");
      setCombinedPreview(null);
      setCombinedPreviewError(null);
      setCombinedPreviewTruncated(false);
      setSelectedOpPreview(null);
      setSelectedOpPreviewError(null);
      setSelectedOpPreviewTruncated(false);
      setRejectMode(false);
      setRejectFeedback("");
      setAiInstruction("");
      setAiMessages([]);
      setAiBusy(false);
      setRationale(null);
      seededForSignalRef.current = null;
      lastCombinedStructuralSig.current = null;
      lastCombinedRerunToken.current = 0;
      lastSelectedRerunToken.current = 0;
      selectedOpPreviewKey.current = null;
      setRerunToken(0);
    }
  }

  // ---- browse mode keyboard nav -------------------------------------------
  const browseListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isBrowseMode || !props.open) return;
    function onKeyDown(e: KeyboardEvent) {
      // Escape is handled by Radix Dialog — only handle arrow keys here.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const list = browseFilteredRules;
        if (list.length === 0) return;
        const currentIdx = list.findIndex((r) => r.id === browseSelectedRuleId);
        let nextIdx: number;
        if (e.key === "ArrowDown") {
          nextIdx = currentIdx < list.length - 1 ? currentIdx + 1 : 0;
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : list.length - 1;
        }
        const nextRule = list[nextIdx];
        if (nextRule) handleBrowseSelectRule(nextRule.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isBrowseMode, props.open, browseFilteredRules, browseSelectedRuleId]);

  // ---- render -------------------------------------------------------------

  if (isBrowseMode) {
    return (
      <Dialog open={props.open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="
            max-w-[92vw] max-h-[88vh] w-[1180px]
            md:max-w-[92vw] md:w-[1180px]
            flex flex-col gap-0 overflow-hidden p-0
          "
        >
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle>Manage Rules</DialogTitle>
            <DialogDescription>
              Browse, search, and edit classification rules. Changes are buffered locally until
              import is committed.
            </DialogDescription>
          </DialogHeader>

          {browseListQuery.isError ? (
            <div className="px-6 pb-6 text-sm text-destructive">
              {browseListQuery.error.message}
            </div>
          ) : browseListQuery.isLoading ? (
            <div className="px-6 pb-6 text-sm text-muted-foreground">Loading rules…</div>
          ) : (
            <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-0 border-y flex-1 min-h-0">
              {/* Sidebar: rule list with search */}
              <div className="flex flex-col min-h-0 border-r" ref={browseListRef}>
                <div className="px-3 py-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={browseSearch}
                      onChange={(e) => setBrowseSearch(e.target.value)}
                      placeholder="Search rules…"
                      className="pl-7 h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b">
                  {browseFilteredRules.length} rule{browseFilteredRules.length === 1 ? "" : "s"}
                  {browseSearch && ` matching "${browseSearch}"`}
                </div>
                <div className="flex-1 overflow-auto">
                  {browseFilteredRules.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">No rules found.</div>
                  ) : (
                    <ul className="divide-y">
                      {browseFilteredRules.map((rule) => {
                        const selected = rule.id === browseSelectedRuleId;
                        const isPending = rule.id.startsWith("temp:");
                        const hasLocalOp = localOps.some(
                          (o) => o.kind !== "add" && o.targetRuleId === rule.id
                        );
                        return (
                          <li
                            key={rule.id}
                            className={`px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                              selected ? "bg-muted" : ""
                            }`}
                            onClick={() => handleBrowseSelectRule(rule.id)}
                          >
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <code className="text-xs truncate max-w-[180px]">
                                    {rule.descriptionPattern}
                                  </code>
                                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                    {rule.matchType}
                                  </Badge>
                                  {isPending && (
                                    <Badge
                                      variant="default"
                                      className="text-[10px] h-4 px-1.5 bg-amber-500"
                                    >
                                      pending
                                    </Badge>
                                  )}
                                  {hasLocalOp && (
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                      edited
                                    </Badge>
                                  )}
                                  {!rule.isActive && (
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                      disabled
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                  {[rule.entityName, rule.location, rule.transactionType]
                                    .filter(Boolean)
                                    .join(" · ") || "no outcome set"}
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="border-t p-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleAddNewRuleOp}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add new rule
                  </Button>
                </div>
              </div>

              {/* Detail: show selected rule or selected op editor */}
              <div className="flex flex-col min-h-0 overflow-auto">
                {selectedOp ? (
                  <DetailPanel
                    op={selectedOp}
                    onChange={(mutator) => {
                      if (!selectedOp) return;
                      updateOp(selectedOp.clientId, mutator);
                    }}
                    disabled={false}
                  />
                ) : browseSelectedRule ? (
                  <BrowseRuleDetailPanel
                    rule={browseSelectedRule}
                    onEdit={handleBrowseEditRule}
                    onDisable={handleBrowseDisableRule}
                    onRemove={handleBrowseRemoveRule}
                  />
                ) : (
                  <div className="p-6 text-sm text-muted-foreground">
                    Select a rule on the left to view or edit it.
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="px-6 py-4 border-t">
            <div className="flex-1 text-xs text-muted-foreground">
              {localOps.length > 0 && (
                <span>
                  {localOps.length} unsaved change{localOps.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleBrowseSave} disabled={localOps.length === 0}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ---- proposal mode render -----------------------------------------------

  const previewResult = previewView === "combined" ? combinedPreview : selectedOpPreview;
  const previewError = previewView === "combined" ? combinedPreviewError : selectedOpPreviewError;
  const previewTruncated =
    previewView === "combined" ? combinedPreviewTruncated : selectedOpPreviewTruncated;
  const previewLabel =
    previewView === "combined"
      ? "Combined effect of entire ChangeSet"
      : selectedOp
        ? `Effect of selected operation`
        : "No operation selected";

  const excludeIds = useMemo(() => {
    const set = new Set<string>();
    for (const op of localOps) {
      if (op.kind !== "add") set.add(op.targetRuleId);
    }
    return set;
  }, [localOps]);

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="
          max-w-[92vw] max-h-[88vh] w-[1180px]
          md:max-w-[92vw] md:w-[1180px]
          flex flex-col gap-0 overflow-hidden p-0
        "
      >
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>Correction proposal</DialogTitle>
          <DialogDescription>
            Edit the proposed rule changes and preview their impact before applying.
          </DialogDescription>
        </DialogHeader>

        {!props.signal ? (
          <div className="px-6 pb-6 text-sm text-muted-foreground">
            No proposal signal provided.
          </div>
        ) : proposeQuery.isError ? (
          <div className="px-6 pb-6 text-sm text-destructive">{proposeQuery.error.message}</div>
        ) : proposeQuery.isLoading && localOps.length === 0 ? (
          <div className="px-6 pb-6 text-sm text-muted-foreground">Generating proposal…</div>
        ) : (
          <>
            <ContextPanel
              signal={props.signal}
              triggeringTransaction={props.triggeringTransaction}
              rationale={rationale}
              opCount={localOps.length}
              combinedSummary={combinedPreview?.summary ?? null}
            />

            <div className="grid grid-cols-[260px_minmax(0,1fr)_360px] gap-0 border-y flex-1 min-h-0">
              <OpsListPanel
                ops={localOps}
                selectedClientId={selectedClientId}
                onSelect={setSelectedClientId}
                onDelete={handleDeleteOp}
                onAddNewRule={handleAddNewRuleOp}
                onAddTargeted={handleAddTargetedOp}
                excludeIds={excludeIds}
                disabled={isBusy}
              />
              <DetailPanel
                op={selectedOp}
                onChange={(mutator) => {
                  if (!selectedOp) return;
                  updateOp(selectedOp.clientId, mutator);
                }}
                disabled={isBusy}
              />
              <ImpactPanel
                view={previewView}
                onViewChange={setPreviewView}
                label={previewLabel}
                previewResult={previewResult}
                previewError={previewError}
                isPending={previewMutation.isPending}
                stale={hasDirty}
                truncated={previewTruncated}
                onRerun={handleRerunPreview}
                disabled={isBusy || localOps.length === 0}
              />
            </div>

            {rejectMode ? (
              <RejectPanel
                feedback={rejectFeedback}
                onFeedbackChange={setRejectFeedback}
                onCancel={() => {
                  setRejectMode(false);
                  setRejectFeedback("");
                }}
                onConfirm={handleConfirmReject}
                busy={rejectMutation.isPending}
              />
            ) : (
              <AiHelperPanel
                messages={aiMessages}
                instruction={aiInstruction}
                onInstructionChange={setAiInstruction}
                onSubmit={handleAiSubmit}
                busy={aiBusy}
              />
            )}
          </>
        )}

        <DialogFooter className="px-6 py-4 border-t">
          <div className="flex-1 text-xs text-muted-foreground">
            {hasDirty ? (
              <span>Preview stale — re-run before applying.</span>
            ) : localOps.length === 0 ? (
              <span>ChangeSet is empty.</span>
            ) : null}
          </div>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isBusy}>
            Cancel
          </Button>
          {!rejectMode && (
            <Button
              variant="outline"
              onClick={() => setRejectMode(true)}
              disabled={isBusy || localOps.length === 0}
            >
              Reject with feedback
            </Button>
          )}
          <Button onClick={handleApprove} disabled={!canApply}>
            Apply ChangeSet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

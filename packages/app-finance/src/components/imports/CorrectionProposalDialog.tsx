import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, RefreshCcw, Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Textarea,
  Badge,
  Separator,
  Input,
  Label,
  Select,
} from "@pops/ui";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";
import type { AppRouter } from "@pops/api-client";
import { trpc } from "../../lib/trpc";
import { RulePicker, type CorrectionRule } from "./RulePicker";

// ---------------------------------------------------------------------------
// tRPC type helpers
// ---------------------------------------------------------------------------

type CorrectionSignal =
  inferRouterInputs<AppRouter>["core"]["corrections"]["proposeChangeSet"]["signal"];
type ApplyChangeSetAndReevaluateOutput =
  inferRouterOutputs<AppRouter>["finance"]["imports"]["applyChangeSetAndReevaluate"];
type PreviewChangeSetOutput =
  inferRouterOutputs<AppRouter>["core"]["corrections"]["previewChangeSet"];
type ProposeChangeSetOutput =
  inferRouterOutputs<AppRouter>["core"]["corrections"]["proposeChangeSet"];
type ServerChangeSet = ProposeChangeSetOutput["changeSet"];
type ServerChangeSetOp = ServerChangeSet["ops"][number];
type AddRuleData = Extract<ServerChangeSetOp, { op: "add" }>["data"];
type EditRuleData = Extract<ServerChangeSetOp, { op: "edit" }>["data"];

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

type OpKind = LocalOp["kind"];

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

function opKindLabel(kind: OpKind): string {
  if (kind === "add") return "Add rule";
  if (kind === "edit") return "Edit rule";
  if (kind === "disable") return "Disable rule";
  return "Remove rule";
}

function opKindBadgeVariant(kind: OpKind): "default" | "secondary" | "outline" | "destructive" {
  if (kind === "add") return "default";
  if (kind === "edit") return "secondary";
  if (kind === "disable") return "outline";
  return "destructive";
}

function opSummary(op: LocalOp): string {
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

function matchTypeLabel(matchType: "exact" | "contains" | "regex"): string {
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
  onApproved?: (result: ApplyChangeSetAndReevaluateOutput["result"], affectedCount: number) => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type PreviewView = "selected" | "combined";

interface AiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export function CorrectionProposalDialog(props: CorrectionProposalDialogProps) {
  const minConfidence = props.minConfidence ?? 0.7;

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
      enabled: Boolean(props.open && proposeInput),
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
    previewMutateAsync({ changeSet, transactions: txns, minConfidence })
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
    previewMutateAsync({ changeSet, transactions: txns, minConfidence })
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
    EMPTY_PREVIEW_SUMMARY,
  ]);

  // ---- apply / reject mutations ------------------------------------------

  const applyMutation = trpc.finance.imports.applyChangeSetAndReevaluate.useMutation({
    onSuccess: (res) => {
      toast.success("Rules applied");
      props.onApproved?.(res.result, res.affectedCount);
      handleOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

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
    proposeQuery.isFetching ||
    previewMutation.isPending ||
    applyMutation.isPending ||
    rejectMutation.isPending ||
    aiBusy;

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
    if (!props.signal) return;
    const newOp = newAddOpFromSignal(props.signal);
    setLocalOps((prev) => [...prev, newOp]);
    setSelectedClientId(newOp.clientId);
  }, [props.signal]);

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
    if (!changeSet || !props.sessionId) return;
    applyMutation.mutate({ sessionId: props.sessionId, changeSet, minConfidence });
  }, [applyMutation, localOps, props.sessionId, minConfidence]);

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

  function handleOpenChange(open: boolean) {
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

  // ---- render -------------------------------------------------------------

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
            {applyMutation.isPending ? "Applying…" : "Apply ChangeSet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Format the user's correction as a "was → now" diff line, derived from the
 * difference between the triggering transaction's pre-correction snapshot and
 * the current correction signal. Returns null when there is nothing to show
 * (e.g. signal is missing both entity and transaction type changes).
 *
 * Brand-new entity assignments (no previous entity) collapse to
 * `assigned entity: <name>`.
 */
function formatCorrectionDiff(
  signal: CorrectionSignal,
  triggering: TriggeringTransactionContext
): string | null {
  const parts: string[] = [];

  const newEntity = signal.entityName ?? null;
  const oldEntity = triggering.previousEntityName ?? null;
  if (newEntity && !oldEntity) {
    parts.push(`assigned entity: ${newEntity}`);
  } else if (newEntity && oldEntity && newEntity !== oldEntity) {
    parts.push(`entity: ${oldEntity} → ${newEntity}`);
  }

  const newType = signal.transactionType ?? null;
  const oldType = triggering.previousTransactionType ?? null;
  if (newType && newType !== oldType) {
    parts.push(oldType ? `type: ${oldType} → ${newType}` : `type: ${newType}`);
  }

  const newLocation = signal.location ?? null;
  const oldLocation = triggering.location ?? null;
  if (newLocation && newLocation !== oldLocation) {
    parts.push(
      oldLocation ? `location: ${oldLocation} → ${newLocation}` : `location: ${newLocation}`
    );
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatCurrency(amount: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function ContextPanel(props: {
  signal: CorrectionSignal;
  triggeringTransaction: TriggeringTransactionContext | null;
  rationale: string | null;
  opCount: number;
  combinedSummary: PreviewChangeSetOutput["summary"] | null;
}) {
  const { signal, triggeringTransaction, rationale, opCount, combinedSummary } = props;
  const diff = triggeringTransaction ? formatCorrectionDiff(signal, triggeringTransaction) : null;
  return (
    <div className="px-6 py-3 bg-muted/30 border-t space-y-3">
      {triggeringTransaction && (
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Triggering transaction
          </div>
          <div className="text-sm font-mono break-all" data-testid="triggering-description">
            {triggeringTransaction.description}
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
            <span data-testid="triggering-amount">
              {formatCurrency(triggeringTransaction.amount)}
            </span>
            <span data-testid="triggering-date">{triggeringTransaction.date}</span>
            <span data-testid="triggering-account">{triggeringTransaction.account}</span>
            {triggeringTransaction.location && (
              <span>location: {triggeringTransaction.location}</span>
            )}
          </div>
          {diff && (
            <div className="text-xs text-foreground" data-testid="triggering-diff">
              {diff}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Proposed rule</div>
          <div className="text-sm">
            When description <strong>{matchTypeLabel(signal.matchType)}</strong>{" "}
            <code className="rounded bg-background px-1 py-0.5 text-xs">
              {signal.descriptionPattern}
            </code>
            {signal.entityName && (
              <>
                {" "}
                → <strong>{signal.entityName}</strong>
              </>
            )}
            {signal.transactionType && (
              <>
                {" "}
                · type <strong>{signal.transactionType}</strong>
              </>
            )}
            {signal.location && (
              <>
                {" "}
                · location <strong>{signal.location}</strong>
              </>
            )}
          </div>
          {rationale && <div className="text-xs text-muted-foreground">{rationale}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {opCount} op{opCount === 1 ? "" : "s"}
          </Badge>
          {combinedSummary && (
            <>
              <Badge variant="secondary">{combinedSummary.newMatches} new</Badge>
              <Badge variant="secondary">{combinedSummary.removedMatches} removed</Badge>
              <Badge variant="secondary">{combinedSummary.statusChanges} status</Badge>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OpsListPanel(props: {
  ops: LocalOp[];
  selectedClientId: string | null;
  onSelect: (clientId: string) => void;
  onDelete: (clientId: string) => void;
  onAddNewRule: () => void;
  onAddTargeted: (kind: "edit" | "disable" | "remove", rule: CorrectionRule) => void;
  excludeIds: ReadonlySet<string>;
  disabled: boolean;
}) {
  const [addMode, setAddMode] = useState<"menu" | "edit" | "disable" | "remove" | null>(null);
  return (
    <div className="flex flex-col min-h-0 border-r">
      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">
        Operations ({props.ops.length})
      </div>
      <div className="flex-1 overflow-auto">
        {props.ops.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            ChangeSet is empty. Add an operation below.
          </div>
        ) : (
          <ul className="divide-y">
            {props.ops.map((op) => {
              const selected = op.clientId === props.selectedClientId;
              return (
                <li
                  key={op.clientId}
                  className={`px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                    selected ? "bg-muted" : ""
                  }`}
                  onClick={() => props.onSelect(op.clientId)}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={opKindBadgeVariant(op.kind)}
                          className="text-[10px] h-4 px-1.5"
                        >
                          {opKindLabel(op.kind)}
                        </Badge>
                        {op.dirty && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-amber-500"
                            title="Unsaved edits — preview stale"
                          />
                        )}
                      </div>
                      <div className="text-xs truncate" title={opSummary(op)}>
                        {opSummary(op)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive p-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onDelete(op.clientId);
                      }}
                      disabled={props.disabled}
                      aria-label="Delete operation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t p-2 space-y-2">
        {addMode === null && (
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start"
            onClick={() => setAddMode("menu")}
            disabled={props.disabled}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add operation
          </Button>
        )}
        {addMode === "menu" && (
          <div className="space-y-1">
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                props.onAddNewRule();
                setAddMode(null);
              }}
            >
              Add new rule
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setAddMode("edit")}
            >
              Edit existing rule…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setAddMode("disable")}
            >
              Disable existing rule…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setAddMode("remove")}
            >
              Remove existing rule…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setAddMode(null)}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
        )}
        {(addMode === "edit" || addMode === "disable" || addMode === "remove") && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground px-1">Pick a rule to {addMode}</div>
            <RulePicker
              value={null}
              excludeIds={props.excludeIds}
              onChange={(rule) => {
                props.onAddTargeted(addMode, rule);
                setAddMode(null);
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setAddMode(null)}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailPanel(props: {
  op: LocalOp | null;
  onChange: (mutator: (op: LocalOp) => LocalOp) => void;
  disabled: boolean;
}) {
  const { op, onChange, disabled } = props;
  if (!op) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select an operation on the left to edit its details.
      </div>
    );
  }

  if (op.kind === "add") {
    return (
      <div className="p-6 overflow-auto space-y-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Add new rule</div>
        <RuleDataEditor
          data={op.data}
          onChange={(next) =>
            onChange((current) => {
              if (current.kind !== "add") return current;
              return { ...current, data: next };
            })
          }
          disabled={disabled}
          mode="add"
        />
      </div>
    );
  }

  if (op.kind === "edit") {
    return (
      <div className="p-6 overflow-auto space-y-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Edit rule</div>
        <TargetRuleCard rule={op.targetRule} targetRuleId={op.targetRuleId} />
        <Separator />
        <EditDataEditor
          data={op.data}
          onChange={(next) =>
            onChange((current) => {
              if (current.kind !== "edit") return current;
              return { ...current, data: next };
            })
          }
          disabled={disabled}
        />
      </div>
    );
  }

  // disable / remove
  return (
    <div className="p-6 overflow-auto space-y-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {op.kind === "disable" ? "Disable rule" : "Remove rule"}
      </div>
      <TargetRuleCard rule={op.targetRule} targetRuleId={op.targetRuleId} />
      <div className="space-y-2">
        <Label>Rationale (optional)</Label>
        <Textarea
          value={op.rationale}
          onChange={(e) =>
            onChange((current) => {
              if (current.kind !== "disable" && current.kind !== "remove") return current;
              return { ...current, rationale: e.target.value };
            })
          }
          placeholder="Why is this rule being removed?"
          rows={3}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function TargetRuleCard(props: { rule: CorrectionRule | null; targetRuleId: string }) {
  if (!props.rule) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Targets rule <code className="text-xs">{props.targetRuleId}</code> (details unavailable)
      </div>
    );
  }
  const r = props.rule;
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Target rule</div>
      <div className="text-sm">
        <code className="rounded bg-background px-1 py-0.5 text-xs">{r.descriptionPattern}</code> ·{" "}
        <span className="text-xs">{r.matchType}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {[r.entityName, r.location, r.transactionType].filter(Boolean).join(" · ") ||
          "no outcome set"}
      </div>
    </div>
  );
}

function RuleDataEditor(props: {
  data: AddRuleData;
  onChange: (next: AddRuleData) => void;
  disabled: boolean;
  mode: "add";
}) {
  const { data, onChange, disabled } = props;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Description pattern</Label>
        <Input
          value={data.descriptionPattern}
          onChange={(e) => onChange({ ...data, descriptionPattern: e.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Match type</Label>
        <Select
          value={data.matchType}
          onChange={(e) =>
            onChange({
              ...data,
              matchType: e.target.value as "exact" | "contains" | "regex",
            })
          }
          options={[
            { value: "exact", label: "Exact" },
            { value: "contains", label: "Contains" },
            { value: "regex", label: "Regex" },
          ]}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Entity name</Label>
        <Input
          value={data.entityName ?? ""}
          onChange={(e) => onChange({ ...data, entityName: e.target.value || undefined })}
          placeholder="e.g. Woolworths"
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Transaction type</Label>
        <Select
          value={data.transactionType ?? ""}
          onChange={(e) =>
            onChange({
              ...data,
              transactionType:
                e.target.value === ""
                  ? undefined
                  : (e.target.value as "purchase" | "transfer" | "income"),
            })
          }
          options={[
            { value: "", label: "— none —" },
            { value: "purchase", label: "Purchase" },
            { value: "transfer", label: "Transfer" },
            { value: "income", label: "Income" },
          ]}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Location</Label>
        <Input
          value={data.location ?? ""}
          onChange={(e) => onChange({ ...data, location: e.target.value || undefined })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function EditDataEditor(props: {
  data: EditRuleData;
  onChange: (next: EditRuleData) => void;
  disabled: boolean;
}) {
  const { data, onChange, disabled } = props;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Entity name</Label>
        <Input
          value={data.entityName ?? ""}
          onChange={(e) => onChange({ ...data, entityName: e.target.value || undefined })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Transaction type</Label>
        <Select
          value={data.transactionType ?? ""}
          onChange={(e) =>
            onChange({
              ...data,
              transactionType:
                e.target.value === ""
                  ? undefined
                  : (e.target.value as "purchase" | "transfer" | "income"),
            })
          }
          options={[
            { value: "", label: "— none —" },
            { value: "purchase", label: "Purchase" },
            { value: "transfer", label: "Transfer" },
            { value: "income", label: "Income" },
          ]}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Location</Label>
        <Input
          value={data.location ?? ""}
          onChange={(e) => onChange({ ...data, location: e.target.value || undefined })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function ImpactPanel(props: {
  view: PreviewView;
  onViewChange: (v: PreviewView) => void;
  label: string;
  previewResult: PreviewChangeSetOutput | null;
  previewError: string | null;
  isPending: boolean;
  stale: boolean;
  truncated: boolean;
  onRerun: () => void;
  disabled: boolean;
}) {
  const { previewResult, previewError } = props;
  return (
    <div className="flex flex-col min-h-0 border-l">
      <div className="px-4 py-2 border-b flex items-center gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">
          Impact
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={props.onRerun}
          disabled={props.disabled}
          title="Re-run preview"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="px-4 py-2 border-b flex gap-1">
        <Button
          size="sm"
          variant={props.view === "selected" ? "default" : "outline"}
          onClick={() => props.onViewChange("selected")}
          className="flex-1"
        >
          Selected
        </Button>
        <Button
          size="sm"
          variant={props.view === "combined" ? "default" : "outline"}
          onClick={() => props.onViewChange("combined")}
          className="flex-1"
        >
          Combined
        </Button>
      </div>
      <div className="px-4 py-2 text-xs text-muted-foreground">
        {props.label}
        {props.stale && <span className="ml-2 text-amber-600">(stale)</span>}
        {props.truncated && (
          <span
            className="ml-2 text-amber-600"
            title={`Previewed against the first ${PREVIEW_CHANGESET_MAX_TRANSACTIONS} matching transactions. The counts below are an under-count — narrow the pattern or re-run after importing in smaller batches to see full impact.`}
          >
            (preview truncated)
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto px-4 pb-4">
        {previewError ? (
          <div className="text-sm text-destructive">{previewError}</div>
        ) : props.isPending && !previewResult ? (
          <div className="text-sm text-muted-foreground">Computing preview…</div>
        ) : !previewResult ? (
          <div className="text-sm text-muted-foreground">No preview yet.</div>
        ) : (
          <ImpactContent result={previewResult} />
        )}
      </div>
    </div>
  );
}

function ImpactContent(props: { result: PreviewChangeSetOutput }) {
  const { diffs, summary } = props.result;
  const changed = diffs.filter((d) => d.changed);
  const unchanged = diffs.filter((d) => !d.changed);
  const MAX_CHANGED = 100;
  const MAX_UNCHANGED = 30;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-[10px]">
          {summary.total} checked
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          +{summary.newMatches}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          -{summary.removedMatches}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {summary.statusChanges} Δ
        </Badge>
      </div>
      {changed.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Will change ({changed.length})
          </div>
          {changed.slice(0, MAX_CHANGED).map((d) => (
            <div
              key={`c-${d.checksum ?? d.description}`}
              className="text-xs rounded border-l-2 border-primary pl-2"
            >
              <div className="font-medium truncate">{d.description}</div>
              <div className="text-[10px] text-muted-foreground">
                {d.before.matched ? d.before.status : "unmatched"} →{" "}
                {d.after.matched ? d.after.status : "unmatched"}
              </div>
            </div>
          ))}
          {changed.length > MAX_CHANGED && (
            <div className="text-[10px] text-muted-foreground">
              Showing first {MAX_CHANGED} of {changed.length}.
            </div>
          )}
        </div>
      )}
      {unchanged.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Already matching ({unchanged.length})
          </div>
          {unchanged.slice(0, MAX_UNCHANGED).map((d) => (
            <div
              key={`u-${d.checksum ?? d.description}`}
              className="text-xs text-muted-foreground truncate"
            >
              {d.description}
            </div>
          ))}
          {unchanged.length > MAX_UNCHANGED && (
            <div className="text-[10px] text-muted-foreground">
              Showing first {MAX_UNCHANGED} of {unchanged.length}.
            </div>
          )}
        </div>
      )}
      {changed.length === 0 && unchanged.length === 0 && (
        <div className="text-xs text-muted-foreground">
          No transactions in the current import match this scope.
        </div>
      )}
    </div>
  );
}

function AiHelperPanel(props: {
  messages: AiMessage[];
  instruction: string;
  onInstructionChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <div className="border-t bg-muted/20 px-6 py-3 space-y-2 max-h-48 flex flex-col">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        AI helper
      </div>
      {props.messages.length > 0 && (
        <div className="flex-1 overflow-auto space-y-1.5 max-h-24">
          {props.messages.map((m) => (
            <div
              key={m.id}
              className={`text-xs ${
                m.role === "user" ? "text-foreground" : "text-muted-foreground italic"
              }`}
            >
              <span className="font-semibold mr-1">{m.role === "user" ? "You:" : "AI:"}</span>
              {m.text}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={props.instruction}
          onChange={(e) => props.onInstructionChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              props.onSubmit();
            }
          }}
          placeholder="e.g. split location into its own rule, or exclude transfers"
          disabled={props.busy}
          className="flex-1"
        />
        <Button onClick={props.onSubmit} disabled={props.busy || !props.instruction.trim()}>
          {props.busy ? "…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

function RejectPanel(props: {
  feedback: string;
  onFeedbackChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div className="border-t bg-destructive/5 px-6 py-3 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-destructive">
        Reject with feedback
      </div>
      <div className="text-xs text-muted-foreground">
        Reject is the escape hatch for "this whole direction is wrong". For day-to-day refinement,
        edit operations in place or use the AI helper.
      </div>
      <Textarea
        value={props.feedback}
        onChange={(e) => props.onFeedbackChange(e.target.value)}
        placeholder="Why is this proposal wrong?"
        rows={2}
        disabled={props.busy}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={props.onCancel} disabled={props.busy}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={props.onConfirm}
          disabled={props.busy || !props.feedback.trim()}
        >
          {props.busy ? "Rejecting…" : "Confirm reject"}
        </Button>
      </div>
    </div>
  );
}

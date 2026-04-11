import { describe, it, expect, beforeEach } from "vitest";
import type { ParsedTransaction } from "@pops/api/modules/finance/imports";
import { useImportStore, type ProcessedTransaction } from "./importStore";

// ---------------------------------------------------------------------------
// importStore — parsedTransactionsFingerprint / processedForFingerprint tests
//
// The Step 3 "already processed" short-circuit is gated on
// `processedForFingerprint === parsedTransactionsFingerprint`. These tests
// exercise the store-level invariants that make that gate safe:
//
//   1. `setParsedTransactions` computes a content fingerprint from checksums.
//   2. Passing an identical list is a no-op for downstream state (Back→
//      Continue bounce without mutation).
//   3. Passing a *different* list wipes downstream processed/confirmed state
//      *and* clears `processedForFingerprint` so Step 3 cannot short-circuit
//      with stale results.
//   4. `setProcessedTransactions` pins results to the live fingerprint.
// ---------------------------------------------------------------------------

function makeTxn(checksum: string, description = "WOOLWORTHS"): ParsedTransaction {
  return {
    date: "2026-01-15",
    description,
    amount: -42.5,
    account: "Amex",
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
  };
}

const sampleProcessed = (): {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
  skipped: ProcessedTransaction[];
} => ({
  matched: [{ description: "WOOLWORTHS" } as unknown as ProcessedTransaction],
  uncertain: [],
  failed: [],
  skipped: [],
});

describe("importStore — parsed/processed fingerprint", () => {
  beforeEach(() => {
    useImportStore.getState().reset();
  });

  it("empty parsed list yields empty fingerprint", () => {
    useImportStore.getState().setParsedTransactions([]);
    expect(useImportStore.getState().parsedTransactionsFingerprint).toBe("");
  });

  it("computes a fingerprint from the concatenated checksums", () => {
    const txns = [makeTxn("a"), makeTxn("b"), makeTxn("c")];
    useImportStore.getState().setParsedTransactions(txns);
    // Implementation detail: checksums joined by '|'. Deliberately asserted
    // so a future refactor can't silently change the invalidation surface.
    expect(useImportStore.getState().parsedTransactionsFingerprint).toBe("a|b|c");
  });

  it("different checksum order yields a different fingerprint", () => {
    useImportStore.getState().setParsedTransactions([makeTxn("a"), makeTxn("b")]);
    const first = useImportStore.getState().parsedTransactionsFingerprint;
    useImportStore.getState().setParsedTransactions([makeTxn("b"), makeTxn("a")]);
    expect(useImportStore.getState().parsedTransactionsFingerprint).not.toBe(first);
  });

  it("re-setting an identical parsed list is a no-op for downstream processed state", () => {
    const txns = [makeTxn("a"), makeTxn("b")];
    useImportStore.getState().setParsedTransactions(txns);
    // Pretend processing finished.
    useImportStore.getState().setProcessedTransactions({
      ...sampleProcessed(),
      warnings: undefined,
    });
    const fp = useImportStore.getState().parsedTransactionsFingerprint;
    expect(useImportStore.getState().processedForFingerprint).toBe(fp);

    // Back→Continue bounce: re-set the same parsed list (same checksums).
    useImportStore.getState().setParsedTransactions([makeTxn("a"), makeTxn("b")]);

    // Processed state must survive so Step 3 can short-circuit.
    expect(useImportStore.getState().processedTransactions.matched).toHaveLength(1);
    expect(useImportStore.getState().processedForFingerprint).toBe(fp);
    expect(useImportStore.getState().parsedTransactionsFingerprint).toBe(fp);
  });

  it("setting a changed parsed list invalidates processed state and clears processedForFingerprint", () => {
    useImportStore.getState().setParsedTransactions([makeTxn("a")]);
    useImportStore.getState().setProcessedTransactions({
      ...sampleProcessed(),
      warnings: undefined,
    });
    expect(useImportStore.getState().processedForFingerprint).not.toBeNull();

    // User went Back→Step 2, re-mapped columns, Continue — different checksums.
    useImportStore.getState().setParsedTransactions([makeTxn("x"), makeTxn("y")]);

    const state = useImportStore.getState();
    expect(state.parsedTransactionsFingerprint).toBe("x|y");
    expect(state.processedForFingerprint).toBeNull();
    expect(state.processedTransactions.matched).toHaveLength(0);
    expect(state.processedTransactions.uncertain).toHaveLength(0);
    expect(state.processedTransactions.failed).toHaveLength(0);
    expect(state.processedTransactions.skipped).toHaveLength(0);
  });

  it("setProcessedTransactions pins processedForFingerprint to the current parsed fingerprint", () => {
    useImportStore.getState().setParsedTransactions([makeTxn("z")]);
    useImportStore.getState().setProcessedTransactions({
      ...sampleProcessed(),
      warnings: undefined,
    });
    expect(useImportStore.getState().processedForFingerprint).toBe("z");
  });

  it("setFile with a different file resets fingerprints and processed state", () => {
    useImportStore.getState().setParsedTransactions([makeTxn("a")]);
    useImportStore.getState().setProcessedTransactions({
      ...sampleProcessed(),
      warnings: undefined,
    });

    // Simulate picking a new file — uses the File shape the setFile comparator expects.
    const fakeFile = { name: "new.csv", size: 10, lastModified: 1 } as unknown as File;
    useImportStore.getState().setFile(fakeFile);

    const state = useImportStore.getState();
    expect(state.parsedTransactionsFingerprint).toBe("");
    expect(state.processedForFingerprint).toBeNull();
    expect(state.processedTransactions.matched).toHaveLength(0);
  });
});

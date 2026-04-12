import { describe, it, expect } from "vitest";
import type { CorrectionRow } from "@pops/api/modules/core/corrections/types";
import type { ProcessedTransaction } from "../store/importStore";
import { reevaluateTransactions } from "./local-re-evaluation";

function makeRule(overrides: Partial<CorrectionRow> = {}): CorrectionRow {
  return {
    id: overrides.id ?? "rule-1",
    descriptionPattern: overrides.descriptionPattern ?? "WOOLWORTHS",
    matchType: overrides.matchType ?? "exact",
    entityId: overrides.entityId ?? "entity-1",
    entityName: overrides.entityName ?? "Woolworths",
    location: overrides.location ?? null,
    tags: overrides.tags ?? "[]",
    transactionType: overrides.transactionType ?? "purchase",
    isActive: overrides.isActive ?? true,
    confidence: overrides.confidence ?? 0.95,
    priority: overrides.priority ?? 0,
    timesApplied: overrides.timesApplied ?? 5,
    createdAt: "2025-01-01T00:00:00.000Z",
    lastUsedAt: null,
  } as CorrectionRow;
}

function makeTxn(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: "2025-01-15",
    description: overrides.description ?? "WOOLWORTHS 1234",
    amount: -42.5,
    account: "Amex",
    rawRow: '{"line":"test"}',
    checksum: `chk-${Math.random().toString(36).slice(2, 10)}`,
    entity: overrides.entity ?? { matchType: "none" },
    status: overrides.status ?? "uncertain",
    ...overrides,
  } as ProcessedTransaction;
}

describe("reevaluateTransactions", () => {
  it("returns empty results when no transactions provided", () => {
    const result = reevaluateTransactions([], [], [makeRule()]);

    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.affectedCount).toBe(0);
  });

  it("promotes uncertain transaction to matched when rule matches", () => {
    const uncertain = [makeTxn({ description: "WOOLWORTHS 1234", status: "uncertain" })];
    const rules = [makeRule({ descriptionPattern: "WOOLWORTHS" })];

    const result = reevaluateTransactions(uncertain, [], rules);

    expect(result.matched).toHaveLength(1);
    expect(result.uncertain).toHaveLength(0);
    expect(result.affectedCount).toBe(1);
    expect(result.matched[0]!.status).toBe("matched");
    expect(result.matched[0]!.entity.entityName).toBe("Woolworths");
  });

  it("promotes failed transaction to matched when rule matches", () => {
    const failed = [makeTxn({ description: "WOOLWORTHS 1234", status: "failed" })];
    const rules = [makeRule({ descriptionPattern: "WOOLWORTHS" })];

    const result = reevaluateTransactions([], failed, rules);

    expect(result.matched).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(result.affectedCount).toBe(1);
  });

  it("keeps uncertain transaction when no rule matches", () => {
    const uncertain = [makeTxn({ description: "UNKNOWN STORE", status: "uncertain" })];
    const rules = [makeRule({ descriptionPattern: "WOOLWORTHS" })];

    const result = reevaluateTransactions(uncertain, [], rules);

    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.affectedCount).toBe(0);
  });

  it("keeps failed transaction when no rule matches", () => {
    const failed = [makeTxn({ description: "UNKNOWN STORE", status: "failed" })];
    const rules = [makeRule({ descriptionPattern: "WOOLWORTHS" })];

    const result = reevaluateTransactions([], failed, rules);

    expect(result.matched).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.affectedCount).toBe(0);
  });

  it("handles multiple transactions with mixed results", () => {
    const uncertain = [
      makeTxn({ description: "WOOLWORTHS 1234", status: "uncertain" }),
      makeTxn({ description: "UNKNOWN MERCHANT", status: "uncertain" }),
    ];
    const failed = [makeTxn({ description: "COLES 5678", status: "failed" })];
    const rules = [
      makeRule({ id: "r1", descriptionPattern: "WOOLWORTHS" }),
      makeRule({ id: "r2", descriptionPattern: "COLES", entityId: "e2", entityName: "Coles" }),
    ];

    const result = reevaluateTransactions(uncertain, failed, rules);

    expect(result.matched).toHaveLength(2); // WOOLWORTHS + COLES
    expect(result.uncertain).toHaveLength(1); // UNKNOWN
    expect(result.failed).toHaveLength(0);
    expect(result.affectedCount).toBe(2);
  });

  it("returns empty when merged rules is empty", () => {
    const uncertain = [makeTxn({ description: "WOOLWORTHS 1234", status: "uncertain" })];

    const result = reevaluateTransactions(uncertain, [], []);

    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.affectedCount).toBe(0);
  });

  it("populates ruleProvenance on matched transactions", () => {
    const uncertain = [makeTxn({ description: "WOOLWORTHS 1234", status: "uncertain" })];
    const rules = [
      makeRule({ id: "rule-42", descriptionPattern: "WOOLWORTHS", matchType: "exact" }),
    ];

    const result = reevaluateTransactions(uncertain, [], rules);

    expect(result.matched[0]!.ruleProvenance).toEqual({
      source: "correction",
      ruleId: "rule-42",
      pattern: "WOOLWORTHS",
      matchType: "exact",
      confidence: 0.95,
    });
  });

  it("uses contains matching", () => {
    const uncertain = [
      makeTxn({ description: "WOOLWORTHS SUPERMARKET CITY", status: "uncertain" }),
    ];
    const rules = [makeRule({ descriptionPattern: "WOOLWORTHS", matchType: "contains" })];

    const result = reevaluateTransactions(uncertain, [], rules);

    expect(result.matched).toHaveLength(1);
    expect(result.affectedCount).toBe(1);
  });

  it("skips rules below minConfidence", () => {
    const uncertain = [makeTxn({ description: "WOOLWORTHS 1234", status: "uncertain" })];
    const rules = [makeRule({ confidence: 0.3 })];

    const result = reevaluateTransactions(uncertain, [], rules, 0.7);

    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
  });

  it("skips inactive rules", () => {
    const uncertain = [makeTxn({ description: "WOOLWORTHS 1234", status: "uncertain" })];
    const rules = [makeRule({ isActive: false })];

    const result = reevaluateTransactions(uncertain, [], rules);

    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
  });

  it("uses regex matching", () => {
    const uncertain = [makeTxn({ description: "WOOLWORTHS SUPERMARKET 42", status: "uncertain" })];
    const rules = [makeRule({ descriptionPattern: "WOOLWORTHS.*", matchType: "regex" })];

    const result = reevaluateTransactions(uncertain, [], rules);

    expect(result.matched).toHaveLength(1);
    expect(result.affectedCount).toBe(1);
  });

  it("prefers exact match over contains and regex", () => {
    const uncertain = [makeTxn({ description: "WOOLWORTHS 1234", status: "uncertain" })];
    const rules = [
      makeRule({
        id: "r-regex",
        descriptionPattern: "WOOLWORTHS.*",
        matchType: "regex",
        confidence: 0.99,
        entityName: "Regex Match",
      }),
      makeRule({
        id: "r-contains",
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        confidence: 0.99,
        entityName: "Contains Match",
      }),
      makeRule({
        id: "r-exact",
        descriptionPattern: "WOOLWORTHS",
        matchType: "exact",
        confidence: 0.95,
        entityName: "Exact Match",
      }),
    ];

    const result = reevaluateTransactions(uncertain, [], rules);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.entity.entityName).toBe("Exact Match");
  });

  it("breaks ties by confidence desc then timesApplied desc", () => {
    const uncertain = [makeTxn({ description: "COLES 42", status: "uncertain" })];
    const rules = [
      makeRule({
        id: "r-low",
        descriptionPattern: "COLES",
        matchType: "contains",
        confidence: 0.8,
        timesApplied: 100,
        entityName: "Low Confidence",
      }),
      makeRule({
        id: "r-high",
        descriptionPattern: "COLES",
        matchType: "contains",
        confidence: 0.95,
        timesApplied: 1,
        entityName: "High Confidence",
      }),
    ];

    const result = reevaluateTransactions(uncertain, [], rules);

    expect(result.matched[0]!.entity.entityName).toBe("High Confidence");
  });

  it("normalizes descriptions (strips digits, uppercases, collapses whitespace)", () => {
    const uncertain = [makeTxn({ description: "woolworths  1234  market", status: "uncertain" })];
    // Pattern is already normalized (uppercase, no digits)
    const rules = [makeRule({ descriptionPattern: "WOOLWORTHS MARKET", matchType: "exact" })];

    const result = reevaluateTransactions(uncertain, [], rules);

    expect(result.matched).toHaveLength(1);
  });
});

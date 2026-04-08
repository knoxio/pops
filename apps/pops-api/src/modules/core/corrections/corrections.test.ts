/**
 * Corrections module tests — CRUD, pattern matching, and tags.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const anthropicMocks = vi.hoisted(() => ({
  createMessage: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class AnthropicMock {
    messages = {
      create: anthropicMocks.createMessage,
    };
    constructor(_opts: unknown) {}
  }

  return { default: AnthropicMock };
});

import { setupTestContext, seedEntity, seedTransaction } from "../../../shared/test-utils.js";
import { logger } from "../../../lib/logger.js";
import * as service from "./service.js";

const ctx = setupTestContext();

describe("corrections", () => {
  let caller: ReturnType<typeof ctx.setup>["caller"];
  let db: ReturnType<typeof ctx.setup>["db"];

  beforeEach(() => {
    const result = ctx.setup();
    caller = result.caller;
    db = result.db;
    anthropicMocks.createMessage.mockReset();
    process.env["CLAUDE_API_KEY"] = "test-key";
  });

  afterEach(() => {
    delete process.env["CLAUDE_API_KEY"];
    ctx.teardown();
  });

  describe("createOrUpdate", () => {
    it("creates a new correction", async () => {
      const result = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        tags: ["Groceries"],
      });

      expect(result.data.descriptionPattern).toBe("WOOLWORTHS");
      expect(result.data.matchType).toBe("contains");
      expect(result.data.tags).toEqual(["Groceries"]);
      expect(result.data.confidence).toBe(0.5);
      expect(result.data.timesApplied).toBe(0);
    });

    it("updates an existing correction on re-create, increasing confidence", async () => {
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        tags: ["Groceries"],
      });

      const result = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        tags: ["Groceries", "Online"],
      });

      // Confidence should increase by 0.1
      expect(result.data.confidence).toBeCloseTo(0.6);
      expect(result.data.timesApplied).toBe(1);
      // tags should be updated
      expect(result.data.tags).toEqual(["Groceries", "Online"]);
    });

    it("normalizes pattern to uppercase with numbers stripped", async () => {
      const result = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "woolworths 1234",
        matchType: "exact",
        tags: ["Groceries"],
      });

      // Pattern is normalized: uppercase, numbers removed, trimmed
      expect(result.data.descriptionPattern).toBe("WOOLWORTHS");
    });
  });

  describe("findMatch", () => {
    beforeEach(async () => {
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        tags: ["Groceries"],
      });
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "NETFLIX",
        matchType: "exact",
        tags: ["Subscriptions", "Entertainment"],
      });
    });

    it("finds exact match", async () => {
      const result = await caller.core.corrections.findMatch({
        description: "NETFLIX",
        minConfidence: 0,
      });

      expect(result.data).not.toBeNull();
      expect(result.data?.descriptionPattern).toBe("NETFLIX");
      expect(result.data?.tags).toEqual(["Subscriptions", "Entertainment"]);
    });

    it("finds contains match", async () => {
      const result = await caller.core.corrections.findMatch({
        description: "WOOLWORTHS SUPERMARKETS AU",
        minConfidence: 0,
      });

      expect(result.data).not.toBeNull();
      expect(result.data?.tags).toContain("Groceries");
    });

    it("returns null when confidence threshold not met", async () => {
      const result = await caller.core.corrections.findMatch({
        description: "NETFLIX",
        minConfidence: 0.99,
      });

      expect(result.data).toBeNull();
      expect(result.status).toBeNull();
    });

    it("returns null for unknown description", async () => {
      const result = await caller.core.corrections.findMatch({
        description: "TOTALLY UNKNOWN MERCHANT XYZ",
        minConfidence: 0,
      });

      expect(result.data).toBeNull();
      expect(result.status).toBeNull();
    });

    it("classifies match as 'uncertain' when confidence < 0.9", async () => {
      // Default confidence is 0.5
      const result = await caller.core.corrections.findMatch({
        description: "NETFLIX",
        minConfidence: 0,
      });

      expect(result.data).not.toBeNull();
      expect(result.status).toBe("uncertain");
    });

    it("classifies match as 'matched' when confidence >= 0.9", async () => {
      // Create a high-confidence correction
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "SHELL PETROL",
        matchType: "exact",
        tags: ["Transport"],
      });
      await caller.core.corrections.update({
        id: created.data.id,
        data: { confidence: 0.95 },
      });

      const result = await caller.core.corrections.findMatch({
        description: "SHELL PETROL",
        minConfidence: 0,
      });

      expect(result.data).not.toBeNull();
      expect(result.status).toBe("matched");
    });

    it("classifies match at exactly 0.9 as 'matched'", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "COLES",
        matchType: "exact",
        tags: ["Groceries"],
      });
      await caller.core.corrections.update({
        id: created.data.id,
        data: { confidence: 0.9 },
      });

      const result = await caller.core.corrections.findMatch({
        description: "COLES",
        minConfidence: 0,
      });

      expect(result.status).toBe("matched");
    });
  });

  describe("list", () => {
    it("lists all corrections", async () => {
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "COLES",
        matchType: "contains",
        tags: ["Groceries"],
      });
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "SPOTIFY",
        matchType: "exact",
        tags: ["Subscriptions"],
      });

      const result = await caller.core.corrections.list({});
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it("filters by minimum confidence", async () => {
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "COLES",
        matchType: "contains",
        tags: ["Groceries"],
      });

      const highConfResult = await caller.core.corrections.list({ minConfidence: 0.9 });
      expect(highConfResult.data).toHaveLength(0);

      const lowConfResult = await caller.core.corrections.list({ minConfidence: 0.1 });
      expect(lowConfResult.data).toHaveLength(1);
    });
  });

  describe("previewChangeSet", () => {
    it("previews added rule impact deterministically", async () => {
      const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
      try {
        const result = await caller.core.corrections.previewChangeSet({
          changeSet: {
            ops: [
              {
                op: "add",
                data: {
                  descriptionPattern: "WOOLWORTHS",
                  matchType: "contains",
                  entityId: null,
                  entityName: "Woolworths",
                  tags: [],
                  transactionType: null,
                  confidence: 0.95,
                },
              },
            ],
          },
          transactions: [
            { description: "WOOLWORTHS SUPERMARKETS AU" },
            { description: "TOTALLY UNKNOWN" },
          ],
          minConfidence: 0.7,
        });

        expect(result.summary.total).toBe(2);
        expect(result.summary.newMatches).toBe(1);
        expect(result.diffs[0]?.after.matched).toBe(true);
        expect(result.diffs[0]?.after.ruleId).toMatch(/^temp:/);
        expect(result.diffs[1]?.after.matched).toBe(false);

        expect(infoSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: "corrections.proposal.preview",
            userEmail: "test@example.com",
            opCount: 1,
            ops: expect.any(Array),
            transactionCount: 2,
            minConfidence: 0.7,
            impactSummary: expect.objectContaining({
              total: 2,
              newMatches: 1,
            }),
          })
        );
      } finally {
        infoSpy.mockRestore();
      }
    });

    it("previews disable removes matches", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "NETFLIX",
        matchType: "exact",
        tags: [],
      });
      await caller.core.corrections.update({ id: created.data.id, data: { confidence: 0.95 } });

      const result = await caller.core.corrections.previewChangeSet({
        changeSet: { ops: [{ op: "disable", id: created.data.id }] },
        transactions: [{ description: "NETFLIX" }],
        minConfidence: 0.7,
      });

      expect(result.summary.removedMatches).toBe(1);
      expect(result.diffs[0]?.before.matched).toBe(true);
      expect(result.diffs[0]?.after.matched).toBe(false);
    });

    it("logs error when ChangeSet references missing rule id", async () => {
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      try {
        await expect(
          caller.core.corrections.previewChangeSet({
            changeSet: { ops: [{ op: "disable", id: "does-not-exist" }] },
            transactions: [{ description: "NETFLIX" }],
            minConfidence: 0.7,
          })
        ).rejects.toThrow();

        expect(errorSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: "corrections.proposal.preview",
            userEmail: "test@example.com",
            opCount: 1,
            ops: expect.any(Array),
            err: expect.anything(),
          })
        );
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  describe("applyChangeSet", () => {
    it("applies operations atomically (disable + add)", async () => {
      const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
      try {
        const created = await caller.core.corrections.createOrUpdate({
          descriptionPattern: "NETFLIX",
          matchType: "exact",
          tags: [],
        });
        await caller.core.corrections.update({ id: created.data.id, data: { confidence: 0.95 } });

        const result = await caller.core.corrections.applyChangeSet({
          changeSet: {
            ops: [
              { op: "disable", id: created.data.id },
              {
                op: "add",
                data: {
                  descriptionPattern: "SPOTIFY",
                  matchType: "exact",
                  tags: [],
                  confidence: 0.95,
                },
              },
            ],
          },
        });

        expect(
          result.data.some((r) => r.descriptionPattern === "NETFLIX" && r.isActive === false)
        ).toBe(true);
        expect(result.data.some((r) => r.descriptionPattern === "SPOTIFY")).toBe(true);

        expect(infoSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: "corrections.proposal.apply",
            userEmail: "test@example.com",
            opCount: 2,
            ops: expect.any(Array),
            outcome: "approved",
            resultRuleCount: expect.any(Number),
          })
        );
      } finally {
        infoSpy.mockRestore();
      }
    });

    it("rolls back on invalid edit target", async () => {
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      try {
        // seed a known correction
        await caller.core.corrections.createOrUpdate({
          descriptionPattern: "COLES",
          matchType: "exact",
          tags: [],
        });

        await expect(
          caller.core.corrections.applyChangeSet({
            changeSet: {
              ops: [
                {
                  op: "add",
                  data: { descriptionPattern: "WOOLWORTHS", matchType: "exact", tags: [] },
                },
                { op: "edit", id: "does-not-exist", data: { confidence: 0.9 } },
              ],
            },
          })
        ).rejects.toThrow();

        // Ensure the add op was not committed due to rollback.
        const list = await caller.core.corrections.list({});
        expect(list.data.some((r) => r.descriptionPattern === "WOOLWORTHS")).toBe(false);

        expect(errorSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: "corrections.proposal.apply",
            userEmail: "test@example.com",
            opCount: 2,
            ops: expect.any(Array),
            outcome: "apply_failed",
            err: expect.anything(),
          })
        );
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  describe("rejectChangeSet", () => {
    it("logs rejection with feedback and returns success message", async () => {
      const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
      try {
        const result = await caller.core.corrections.rejectChangeSet({
          signal: {
            descriptionPattern: "WOOLWORTHS",
            matchType: "contains",
            tags: [],
          },
          changeSet: {
            ops: [
              {
                op: "add",
                data: {
                  descriptionPattern: "WOOLWORTHS",
                  matchType: "contains",
                  tags: [],
                  confidence: 0.95,
                },
              },
            ],
          },
          feedback: "Too broad — needs to be more specific",
          impactSummary: {
            total: 2,
            newMatches: 1,
            removedMatches: 0,
            statusChanges: 0,
            netMatchedDelta: 1,
          },
        });

        expect(result.message).toBe("ChangeSet rejected");
        expect(infoSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: "corrections.proposal.reject",
            userEmail: "test@example.com",
            opCount: 1,
            ops: expect.any(Array),
            outcome: "rejected",
            feedback: "Too broad — needs to be more specific",
            impactSummary: expect.objectContaining({ total: 2 }),
          })
        );
      } finally {
        infoSpy.mockRestore();
      }
    });

    it("rejects empty feedback", async () => {
      await expect(
        caller.core.corrections.rejectChangeSet({
          signal: {
            descriptionPattern: "WOOLWORTHS",
            matchType: "contains",
            tags: [],
          },
          changeSet: {
            ops: [
              {
                op: "add",
                data: {
                  descriptionPattern: "WOOLWORTHS",
                  matchType: "contains",
                  tags: [],
                  confidence: 0.95,
                },
              },
            ],
          },
          feedback: "",
        })
      ).rejects.toThrow();
    });

    it("still returns success when persistence fails", async () => {
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const persistSpy = vi
        .spyOn(service, "persistRejectedChangeSetFeedback")
        .mockImplementation(() => {
          throw new Error("db down");
        });

      try {
        const result = await caller.core.corrections.rejectChangeSet({
          signal: { descriptionPattern: "WOOLWORTHS", matchType: "contains", tags: [] },
          changeSet: {
            ops: [
              {
                op: "add",
                data: {
                  descriptionPattern: "WOOLWORTHS",
                  matchType: "contains",
                  tags: [],
                  confidence: 0.95,
                },
              },
            ],
          },
          feedback: "any feedback",
        });

        expect(result.message).toBe("ChangeSet rejected");
        expect(errorSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: "corrections.proposal.reject.persistence_failed",
            err: expect.anything(),
          })
        );
      } finally {
        persistSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });

  describe("proposeChangeSet", () => {
    it("generates a ChangeSet proposal and includes type-only outcomes", async () => {
      const transactionId = seedTransaction(db, {
        description: "TRANSFER TO SAVINGS",
        account: "Up",
        amount: -10,
        date: "2026-01-01",
        type: "purchase",
        tags: "[]",
        last_edited_time: new Date().toISOString(),
      });

      const result = await caller.core.corrections.proposeChangeSet({
        signal: {
          descriptionPattern: "TRANSFER TO SAVINGS",
          matchType: "exact",
          tags: [],
          transactionType: "transfer",
        },
        minConfidence: 0,
        maxPreviewItems: 200,
      });

      expect(result.changeSet.ops).toHaveLength(1);
      expect(result.preview.counts.affected).toBeGreaterThan(0);
      expect(result.preview.affected.some((a) => a.transactionId === transactionId)).toBe(true);

      const affected = result.preview.affected.find((a) => a.transactionId === transactionId);
      expect(affected?.before.transactionType).toBeNull();
      expect(affected?.after.transactionType).toBe("transfer");
    });

    it("proposes edit when rule already exists", async () => {
      const entityId = seedEntity(db, { name: "Woolworths" });
      await caller.core.corrections.createOrUpdate({
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        entityId,
        entityName: "Woolworths",
        tags: ["Groceries"],
      });
      const list = await caller.core.corrections.list({});
      const existingId = list.data.find((r) => r.descriptionPattern === "WOOLWORTHS")?.id ?? null;
      expect(existingId).not.toBeNull();

      const result = await caller.core.corrections.proposeChangeSet({
        signal: {
          descriptionPattern: "WOOLWORTHS",
          matchType: "contains",
          tags: ["Groceries", "Online"],
        },
        minConfidence: 0,
        maxPreviewItems: 10,
      });

      const op = result.changeSet.ops[0];
      expect(op?.op).toBe("edit");
      if (!op || op.op !== "edit") throw new Error("Expected edit op");
      expect(op.id).toBe(existingId);
    });

    it("respects maxPreviewItems limit", async () => {
      for (let i = 0; i < 5; i += 1) {
        seedTransaction(db, {
          description: `FOO ${i} BAR`,
          last_edited_time: new Date().toISOString(),
        });
      }

      const result = await caller.core.corrections.proposeChangeSet({
        signal: { descriptionPattern: "FOO BAR", matchType: "contains", tags: [] },
        minConfidence: 0,
        maxPreviewItems: 2,
      });

      expect(result.preview.affected.length).toBeLessThanOrEqual(2);
    });

    it("does not miss candidates when digits are stripped during normalization", async () => {
      const id = seedTransaction(db, {
        description: "FOO 123 BAR",
        last_edited_time: new Date().toISOString(),
      });

      const result = await caller.core.corrections.proposeChangeSet({
        signal: { descriptionPattern: "FOO BAR", matchType: "contains", tags: [] },
        minConfidence: 0,
        maxPreviewItems: 50,
      });

      expect(result.preview.affected.some((a) => a.transactionId === id)).toBe(true);
    });

    it("incorporates rejection feedback into follow-up proposals", async () => {
      await caller.core.corrections.rejectChangeSet({
        signal: { descriptionPattern: "WOOLWORTHS", matchType: "contains", tags: [] },
        changeSet: {
          source: "correction-signal",
          reason: "Initial proposal",
          ops: [
            {
              op: "add",
              data: { descriptionPattern: "WOOLWORTHS", matchType: "contains", tags: [] },
            },
          ],
        },
        feedback: "Too broad, should be exact match",
        impactSummary: {
          total: 10,
          newMatches: 10,
          removedMatches: 0,
          statusChanges: 0,
          netMatchedDelta: 10,
        },
      });

      anthropicMocks.createMessage.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              adaptedSignal: {
                descriptionPattern: "WOOLWORTHS",
                matchType: "exact",
                entityId: null,
                entityName: null,
                location: null,
                tags: [],
                transactionType: null,
              },
            }),
          },
        ],
        usage: { input_tokens: 10, output_tokens: 10 },
      });

      const result = await caller.core.corrections.proposeChangeSet({
        signal: { descriptionPattern: "WOOLWORTHS", matchType: "contains", tags: [] },
        minConfidence: 0,
        maxPreviewItems: 10,
      });

      expect(result.changeSet.source).toBe("correction-signal-followup");
      expect(result.rationale).toContain("Follow-up");
      expect(result.rationale).toContain("Too broad, should be exact match");
      expect(result.changeSet.reason).toContain("Too broad, should be exact match");
      expect(result.changeSet.ops[0]?.op).toBe("add");
      if (!result.changeSet.ops[0] || result.changeSet.ops[0].op !== "add")
        throw new Error("Expected add op");
      expect(result.changeSet.ops[0].data.matchType).toBe("exact");
      expect(anthropicMocks.createMessage).toHaveBeenCalledTimes(1);
    });

    it("falls back to original signal when Haiku returns invalid JSON", async () => {
      await caller.core.corrections.rejectChangeSet({
        signal: { descriptionPattern: "WOOLWORTHS", matchType: "contains", tags: [] },
        changeSet: {
          source: "correction-signal",
          reason: "Initial proposal",
          ops: [
            {
              op: "add",
              data: { descriptionPattern: "WOOLWORTHS", matchType: "contains", tags: [] },
            },
          ],
        },
        feedback: "Only match the full description",
      });

      anthropicMocks.createMessage.mockResolvedValue({
        content: [{ type: "text", text: "not json" }],
        usage: { input_tokens: 10, output_tokens: 10 },
      });

      const result = await caller.core.corrections.proposeChangeSet({
        signal: { descriptionPattern: "WOOLWORTHS", matchType: "contains", tags: [] },
        minConfidence: 0,
        maxPreviewItems: 10,
      });

      expect(result.changeSet.ops[0]?.op).toBe("add");
      if (!result.changeSet.ops[0] || result.changeSet.ops[0].op !== "add")
        throw new Error("Expected add op");
      expect(result.changeSet.ops[0].data.matchType).toBe("contains");
    });

    it("falls back to original signal when AI is unavailable", async () => {
      await caller.core.corrections.rejectChangeSet({
        signal: { descriptionPattern: "WOOLWORTHS", matchType: "contains", tags: [] },
        changeSet: {
          source: "correction-signal",
          reason: "Initial proposal",
          ops: [
            {
              op: "add",
              data: { descriptionPattern: "WOOLWORTHS", matchType: "contains", tags: [] },
            },
          ],
        },
        feedback: "Only match the full description",
      });

      delete process.env["CLAUDE_API_KEY"];

      const result = await caller.core.corrections.proposeChangeSet({
        signal: { descriptionPattern: "WOOLWORTHS", matchType: "contains", tags: [] },
        minConfidence: 0,
        maxPreviewItems: 10,
      });

      expect(result.changeSet.ops[0]?.op).toBe("add");
      if (!result.changeSet.ops[0] || result.changeSet.ops[0].op !== "add")
        throw new Error("Expected add op");
      expect(result.changeSet.ops[0].data.matchType).toBe("contains");
      expect(anthropicMocks.createMessage).not.toHaveBeenCalled();
    });

    it("overwrites rejection feedback for the same signal (latest wins)", async () => {
      await caller.core.corrections.rejectChangeSet({
        signal: { descriptionPattern: "FOO", matchType: "contains", tags: [] },
        changeSet: {
          source: "correction-signal",
          reason: "Initial proposal",
          ops: [
            { op: "add", data: { descriptionPattern: "FOO", matchType: "contains", tags: [] } },
          ],
        },
        feedback: "first",
      });

      await caller.core.corrections.rejectChangeSet({
        signal: { descriptionPattern: "FOO", matchType: "contains", tags: [] },
        changeSet: {
          source: "correction-signal",
          reason: "Initial proposal",
          ops: [
            { op: "add", data: { descriptionPattern: "FOO", matchType: "contains", tags: [] } },
          ],
        },
        feedback: "second",
      });

      const result = await caller.core.corrections.proposeChangeSet({
        signal: { descriptionPattern: "FOO", matchType: "contains", tags: [] },
        minConfidence: 0,
        maxPreviewItems: 10,
      });

      expect(result.rationale).toContain("second");
      expect(result.rationale).not.toContain("first");
    });

    it("isolates rejection feedback across different signals", async () => {
      await caller.core.corrections.rejectChangeSet({
        signal: { descriptionPattern: "ALPHA", matchType: "contains", tags: [] },
        changeSet: {
          source: "correction-signal",
          reason: "Initial proposal",
          ops: [
            { op: "add", data: { descriptionPattern: "ALPHA", matchType: "contains", tags: [] } },
          ],
        },
        feedback: "alpha feedback",
      });

      const beta = await caller.core.corrections.proposeChangeSet({
        signal: { descriptionPattern: "BETA", matchType: "contains", tags: [] },
        minConfidence: 0,
        maxPreviewItems: 10,
      });

      expect(beta.rationale).not.toContain("alpha feedback");
    });
  });

  describe("update", () => {
    it("updates tags on existing correction", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "UBER EATS",
        matchType: "contains",
        tags: ["Dining"],
      });

      const updated = await caller.core.corrections.update({
        id: created.data.id,
        data: { tags: ["Dining", "Online"] },
      });

      expect(updated.data.tags).toEqual(["Dining", "Online"]);
    });

    it("updates confidence", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "AMAZON",
        matchType: "contains",
        tags: ["Shopping"],
      });

      const updated = await caller.core.corrections.update({
        id: created.data.id,
        data: { confidence: 0.9 },
      });

      expect(updated.data.confidence).toBe(0.9);
    });
  });

  describe("delete", () => {
    it("deletes a correction", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "SHELL",
        matchType: "contains",
        tags: ["Transport"],
      });

      await caller.core.corrections.delete({ id: created.data.id });

      const result = await caller.core.corrections.list({});
      expect(result.data).toHaveLength(0);
    });
  });

  describe("adjustConfidence", () => {
    it("increases confidence", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "JB HIFI",
        matchType: "contains",
        tags: ["Shopping"],
      });

      await caller.core.corrections.adjustConfidence({ id: created.data.id, delta: 0.2 });

      const result = await caller.core.corrections.get({ id: created.data.id });
      expect(result.data.confidence).toBeCloseTo(0.7);
    });

    it("deletes correction when confidence drops below 0.3", async () => {
      const created = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "MYSTERY MERCHANT",
        matchType: "exact",
        tags: [],
      });

      await caller.core.corrections.adjustConfidence({ id: created.data.id, delta: -0.3 });

      // Should be deleted since 0.5 - 0.3 = 0.2 < 0.3
      const list = await caller.core.corrections.list({});
      expect(list.data).toHaveLength(0);
    });
  });

  describe("tags integration", () => {
    it("corrections with no tags return empty array", async () => {
      const result = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "TRANSFER",
        matchType: "contains",
        tags: [],
      });

      expect(result.data.tags).toEqual([]);
    });

    it("multiple tags are stored and retrieved correctly", async () => {
      const result = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "MEDICARE",
        matchType: "contains",
        tags: ["Health", "Government", "Tax Deductible"],
      });

      expect(result.data.tags).toHaveLength(3);
      expect(result.data.tags).toContain("Health");
      expect(result.data.tags).toContain("Government");
      expect(result.data.tags).toContain("Tax Deductible");
    });
  });

  describe("entity association", () => {
    it("associates a correction with an entity", async () => {
      const entityId = seedEntity(db, { name: "Woolworths" });

      const result = await caller.core.corrections.createOrUpdate({
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        entityId,
        entityName: "Woolworths",
        tags: ["Groceries"],
      });

      expect(result.data.entityId).toBe(entityId);
      expect(result.data.entityName).toBe("Woolworths");
    });
  });
});

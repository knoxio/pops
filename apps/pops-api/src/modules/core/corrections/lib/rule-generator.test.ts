import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
const sharedMockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return { messages: { create: sharedMockCreate } };
  }),
}));

vi.mock("../../../../env.js", () => ({
  getEnv: vi.fn((key: string) => (key === "CLAUDE_API_KEY" ? "test-key" : undefined)),
}));

vi.mock("../../../../db.js", () => ({
  getDrizzle: () => ({
    insert: () => ({
      values: () => ({
        run: vi.fn(),
      }),
    }),
  }),
}));

vi.mock("@pops/db-types", () => ({
  aiUsage: {},
  transactions: { tags: "tags" },
}));

vi.mock("../../../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { analyzeCorrection } from "./rule-generator.js";
import type { CorrectionAnalysis } from "./rule-generator.js";

const mockCreate = sharedMockCreate;

function makeAiResponse(text: string) {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("analyzeCorrection", () => {
  it("returns AI-suggested pattern on success", async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"prefix","pattern":"WOOLWORTHS","confidence":0.9}')
    );

    const result = await analyzeCorrection({
      description: "WOOLWORTHS 1234 SYDNEY",
      entityName: "Woolworths",
      amount: -42.5,
    });

    expect(result).toEqual({
      matchType: "prefix",
      pattern: "WOOLWORTHS",
      confidence: 0.9,
    } satisfies CorrectionAnalysis);
  });

  it("handles contains matchType", async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"contains","pattern":"NETFLIX","confidence":0.85}')
    );

    const result = await analyzeCorrection({
      description: "PAYMENT TO NETFLIX",
      entityName: "Netflix",
      amount: -15.99,
    });

    expect(result).toEqual({
      matchType: "contains",
      pattern: "NETFLIX",
      confidence: 0.85,
    });
  });

  it("returns null when API key is not configured", async () => {
    const { getEnv } = await import("../../../../env.js");
    (getEnv as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);

    const result = await analyzeCorrection({
      description: "TEST",
      entityName: "Test",
      amount: -10,
    });

    expect(result).toBeNull();
  });

  it("returns null when AI call throws", async () => {
    mockCreate.mockRejectedValue(new Error("API error"));

    const result = await analyzeCorrection({
      description: "WOOLWORTHS 1234",
      entityName: "Woolworths",
      amount: -42.5,
    });

    expect(result).toBeNull();
  });

  it("returns null when AI returns empty content", async () => {
    mockCreate.mockResolvedValue({
      content: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const result = await analyzeCorrection({
      description: "WOOLWORTHS 1234",
      entityName: "Woolworths",
      amount: -42.5,
    });

    expect(result).toBeNull();
  });

  it("returns null when pattern is too short (< 3 chars)", async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"prefix","pattern":"AB","confidence":0.8}')
    );

    const result = await analyzeCorrection({
      description: "AB CORP",
      entityName: "AB",
      amount: -10,
    });

    expect(result).toBeNull();
  });

  it("returns null for invalid matchType", async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"regex","pattern":"WOOLWORTHS.*","confidence":0.7}')
    );

    const result = await analyzeCorrection({
      description: "WOOLWORTHS 1234",
      entityName: "Woolworths",
      amount: -42.5,
    });

    // regex is not valid for analyzeCorrection (only exact/prefix/contains)
    expect(result).toBeNull();
  });

  it("returns null for confidence out of range", async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"prefix","pattern":"WOOLWORTHS","confidence":1.5}')
    );

    const result = await analyzeCorrection({
      description: "WOOLWORTHS 1234",
      entityName: "Woolworths",
      amount: -42.5,
    });

    expect(result).toBeNull();
  });

  it("strips markdown code fences from response", async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('```json\n{"matchType":"prefix","pattern":"WOOLWORTHS","confidence":0.9}\n```')
    );

    const result = await analyzeCorrection({
      description: "WOOLWORTHS 1234",
      entityName: "Woolworths",
      amount: -42.5,
    });

    expect(result).toEqual({
      matchType: "prefix",
      pattern: "WOOLWORTHS",
      confidence: 0.9,
    });
  });

  it("does not send account information to the AI", async () => {
    mockCreate.mockResolvedValue(
      makeAiResponse('{"matchType":"prefix","pattern":"WOOLWORTHS","confidence":0.9}')
    );

    await analyzeCorrection({
      description: "WOOLWORTHS 1234 SYDNEY",
      entityName: "Woolworths",
      amount: -42.5,
    });

    // Verify the prompt does not contain "account" or any account identifier
    const promptArg = mockCreate.mock.calls[0]?.[0];
    const promptContent = promptArg?.messages?.[0]?.content as string;
    expect(promptContent).not.toContain("Account:");
    expect(promptContent).not.toContain("account:");
  });
});

import { describe, it, expect } from "vitest";
import { transformAmex } from "./amex.js";
import crypto from "crypto";

/**
 * Unit tests for Amex CSV transformer functions.
 * All functions are pure (no external dependencies) and tested in isolation.
 */

describe("transformAmex", () => {
  it("transforms complete Amex CSV row correctly", () => {
    const row = {
      Date: "13/02/2026",
      Description: "WOOLWORTHS  1234",
      Amount: "125.50",
      "Town/City": "NORTH SYDNEY\nNSW",
      Country: "AUSTRALIA",
    };

    const result = transformAmex(row);

    expect(result.date).toBe("2026-02-13");
    expect(result.description).toBe("WOOLWORTHS 1234"); // Double space removed
    expect(result.amount).toBe(-125.5); // Inverted
    expect(result.account).toBe("Amex");
    expect(result.location).toBe("North Sydney"); // Title-cased first line
    expect(result.online).toBe(false);
    expect(result.rawRow).toBe(JSON.stringify(row));
    expect(result.checksum).toBe(
      crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex")
    );
  });

  it("generates consistent checksum for same CSV row", () => {
    const row = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100.00",
    };

    const result1 = transformAmex(row);
    const result2 = transformAmex(row);

    expect(result1.checksum).toBe(result2.checksum);
    expect(result1.checksum).toHaveLength(64); // SHA-256 hex digest
  });

  it("generates different checksums for different rows", () => {
    const row1 = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100.00",
    };

    const row2 = {
      Date: "14/02/2026",
      Description: "TEST",
      Amount: "100.00",
    };

    const result1 = transformAmex(row1);
    const result2 = transformAmex(row2);

    expect(result1.checksum).not.toBe(result2.checksum);
  });

  it("detects online transaction", () => {
    const row = {
      Date: "13/02/2026",
      Description: "HELP.UBER.COM",
      Amount: "25.00",
    };

    const result = transformAmex(row);

    expect(result.online).toBe(true);
  });

  it("detects offline transaction", () => {
    const row = {
      Date: "13/02/2026",
      Description: "WOOLWORTHS 1234",
      Amount: "125.50",
    };

    const result = transformAmex(row);

    expect(result.online).toBe(false);
  });

  it("handles missing optional fields", () => {
    const row = {
      Date: "13/02/2026",
      Description: "MERCHANT",
      Amount: "50.00",
      "Town/City": "",
    };

    const result = transformAmex(row);

    expect(result.location).toBeUndefined();
    expect(result.online).toBe(false);
  });

  it("throws error for missing required Date field", () => {
    const row = {
      Description: "MERCHANT",
      Amount: "50.00",
    };

    expect(() => transformAmex(row)).toThrow();
  });

  it("throws error for missing required Amount field", () => {
    const row: Record<string, unknown> = {
      Date: "13/02/2026",
      Description: "MERCHANT",
      Amount: undefined,
    };

    expect(() => transformAmex(row as Record<string, string>)).toThrow("Invalid amount");
  });

  it("throws error for invalid date format", () => {
    const row = {
      Date: "2026-02-13", // Wrong format (YYYY-MM-DD instead of DD/MM/YYYY)
      Description: "MERCHANT",
      Amount: "50.00",
    };

    expect(() => transformAmex(row)).toThrow("Invalid date format");
  });

  it("handles empty description", () => {
    const row = {
      Date: "13/02/2026",
      Description: "",
      Amount: "50.00",
    };

    const result = transformAmex(row);

    expect(result.description).toBe("");
  });

  it("handles very long description", () => {
    const row = {
      Date: "13/02/2026",
      Description: "A".repeat(500),
      Amount: "50.00",
    };

    const result = transformAmex(row);

    expect(result.description).toBe("A".repeat(500));
  });
});

describe("normaliseDate", () => {
  // Note: normaliseDate is not exported, but we test it indirectly through transformAmex
  // If bugs are found, we can make it exported for direct testing

  it("converts DD/MM/YYYY to YYYY-MM-DD via transformAmex", () => {
    const row = { Date: "13/02/2026", Description: "TEST", Amount: "100" };
    expect(transformAmex(row).date).toBe("2026-02-13");
  });

  it("pads single-digit day", () => {
    const row = { Date: "1/02/2026", Description: "TEST", Amount: "100" };
    expect(transformAmex(row).date).toBe("2026-02-01");
  });

  it("pads single-digit month", () => {
    const row = { Date: "13/2/2026", Description: "TEST", Amount: "100" };
    expect(transformAmex(row).date).toBe("2026-02-13");
  });

  it("pads both single-digit day and month", () => {
    const row = { Date: "1/2/2026", Description: "TEST", Amount: "100" };
    expect(transformAmex(row).date).toBe("2026-02-01");
  });

  it("handles leap year date", () => {
    const row = { Date: "29/02/2024", Description: "TEST", Amount: "100" };
    expect(transformAmex(row).date).toBe("2024-02-29");
  });

  it("throws error for wrong separator", () => {
    const row = { Date: "13-02-2026", Description: "TEST", Amount: "100" };
    expect(() => transformAmex(row)).toThrow("Invalid date format");
  });

  it("throws error for wrong format (YYYY-MM-DD)", () => {
    const row = { Date: "2026-02-13", Description: "TEST", Amount: "100" };
    expect(() => transformAmex(row)).toThrow("Invalid date format");
  });

  it("throws error for invalid date (too many parts)", () => {
    const row = { Date: "13/02/2026/extra", Description: "TEST", Amount: "100" };
    expect(() => transformAmex(row)).toThrow("Invalid date format");
  });

  it("throws error for empty string", () => {
    const row = { Date: "", Description: "TEST", Amount: "100" };
    expect(() => transformAmex(row)).toThrow("Invalid date format");
  });
});

describe("normaliseAmount", () => {
  it("inverts positive amount to negative", () => {
    const row = { Date: "13/02/2026", Description: "TEST", Amount: "100.50" };
    expect(transformAmex(row).amount).toBe(-100.5);
  });

  it("inverts negative amount to positive (refunds)", () => {
    const row = { Date: "13/02/2026", Description: "REFUND", Amount: "-50.25" };
    expect(transformAmex(row).amount).toBe(50.25);
  });

  it("handles zero correctly", () => {
    const row = { Date: "13/02/2026", Description: "TEST", Amount: "0" };
    expect(transformAmex(row).amount).toBe(-0);
  });

  it("handles decimal amounts", () => {
    const row = { Date: "13/02/2026", Description: "TEST", Amount: "1234.56" };
    expect(transformAmex(row).amount).toBe(-1234.56);
  });

  it("handles amount with many decimal places", () => {
    const row = { Date: "13/02/2026", Description: "TEST", Amount: "100.123456" };
    expect(transformAmex(row).amount).toBe(-100.123456);
  });

  it("handles very large amount", () => {
    const row = { Date: "13/02/2026", Description: "TEST", Amount: "999999.99" };
    expect(transformAmex(row).amount).toBe(-999999.99);
  });

  it("handles amount with leading whitespace", () => {
    const row = { Date: "13/02/2026", Description: "TEST", Amount: "  100.00" };
    expect(transformAmex(row).amount).toBe(-100.0);
  });

  it("handles amount with trailing whitespace", () => {
    const row = { Date: "13/02/2026", Description: "TEST", Amount: "100.00  " };
    expect(transformAmex(row).amount).toBe(-100.0);
  });

  it("throws error for non-numeric string", () => {
    const row = { Date: "13/02/2026", Description: "TEST", Amount: "abc" };
    expect(() => transformAmex(row)).toThrow("Invalid amount");
  });

  it("throws error for empty string", () => {
    const row = { Date: "13/02/2026", Description: "TEST", Amount: "" };
    expect(() => transformAmex(row)).toThrow("Invalid amount");
  });

  it("throws error for null", () => {
    const row: Record<string, unknown> = { Date: "13/02/2026", Description: "TEST", Amount: null };
    expect(() => transformAmex(row as Record<string, string>)).toThrow("Invalid amount");
  });

  it("throws error for undefined", () => {
    const row: Record<string, unknown> = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: undefined,
    };
    expect(() => transformAmex(row as Record<string, string>)).toThrow("Invalid amount");
  });
});

describe("extractLocation", () => {
  it("extracts first line from multiline string", () => {
    const row = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100",
      "Town/City": "NORTH SYDNEY\nNSW",
    };
    expect(transformAmex(row).location).toBe("North Sydney");
  });

  it("title-cases all-caps input", () => {
    const row = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100",
      "Town/City": "SYDNEY",
    };
    expect(transformAmex(row).location).toBe("Sydney");
  });

  it("returns undefined for empty string", () => {
    const row = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100",
      "Town/City": "",
    };
    expect(transformAmex(row).location).toBeUndefined();
  });

  it("returns undefined for whitespace-only", () => {
    const row = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100",
      "Town/City": "   ",
    };
    expect(transformAmex(row).location).toBeUndefined();
  });

  it("handles single-line input", () => {
    const row = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100",
      "Town/City": "MELBOURNE",
    };
    expect(transformAmex(row).location).toBe("Melbourne");
  });

  it("title-cases mixed-case input", () => {
    const row = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100",
      "Town/City": "nOrTh SyDnEy",
    };
    expect(transformAmex(row).location).toBe("North Sydney");
  });

  it("handles single-word location", () => {
    const row = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100",
      "Town/City": "SYDNEY",
    };
    expect(transformAmex(row).location).toBe("Sydney");
  });

  it("ignores subsequent lines", () => {
    const row = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100",
      "Town/City": "SYDNEY\nNSW\nAUSTRALIA",
    };
    expect(transformAmex(row).location).toBe("Sydney");
  });

  it("returns undefined for empty first line", () => {
    const row = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100",
      "Town/City": "\n\nSYDNEY",
    };
    expect(transformAmex(row).location).toBeUndefined();
  });

  it("preserves numbers in location", () => {
    const row = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100",
      "Town/City": "SYDNEY 2000",
    };
    expect(transformAmex(row).location).toBe("Sydney 2000");
  });

  it("returns undefined for missing field", () => {
    const row = {
      Date: "13/02/2026",
      Description: "TEST",
      Amount: "100",
    };
    expect(transformAmex(row).location).toBeUndefined();
  });
});

describe("detectOnline", () => {
  it("returns true for HELP.UBER.COM", () => {
    const row = { Date: "13/02/2026", Description: "HELP.UBER.COM", Amount: "100" };
    expect(transformAmex(row).online).toBe(true);
  });

  it("returns true for PAYPAL", () => {
    const row = { Date: "13/02/2026", Description: "PAYPAL *MERCHANT", Amount: "100" };
    expect(transformAmex(row).online).toBe(true);
  });

  it("returns true for AMAZON", () => {
    const row = { Date: "13/02/2026", Description: "AMAZON.COM.AU", Amount: "100" };
    expect(transformAmex(row).online).toBe(true);
  });

  it("returns true for NETFLIX", () => {
    const row = { Date: "13/02/2026", Description: "NETFLIX.COM", Amount: "100" };
    expect(transformAmex(row).online).toBe(true);
  });

  it("returns true for SPOTIFY", () => {
    const row = { Date: "13/02/2026", Description: "SPOTIFY P1234567", Amount: "100" };
    expect(transformAmex(row).online).toBe(true);
  });

  it("returns true for APPLE.COM", () => {
    const row = { Date: "13/02/2026", Description: "APPLE.COM/BILL", Amount: "100" };
    expect(transformAmex(row).online).toBe(true);
  });

  it("returns true for .COM.AU domain", () => {
    const row = { Date: "13/02/2026", Description: "RANDOMSTORE.COM.AU", Amount: "100" };
    expect(transformAmex(row).online).toBe(true);
  });

  it("returns true for .CO.UK domain", () => {
    const row = { Date: "13/02/2026", Description: "AMAZON.CO.UK", Amount: "100" };
    expect(transformAmex(row).online).toBe(true);
  });

  it("returns false for no indicators", () => {
    const row = { Date: "13/02/2026", Description: "WOOLWORTHS 1234", Amount: "100" };
    expect(transformAmex(row).online).toBe(false);
  });

  it("is case-insensitive (lowercase paypal)", () => {
    const row = { Date: "13/02/2026", Description: "paypal *merchant", Amount: "100" };
    expect(transformAmex(row).online).toBe(true);
  });

  it("is case-insensitive (mixed case PayPal)", () => {
    const row = { Date: "13/02/2026", Description: "PayPal *Merchant", Amount: "100" };
    expect(transformAmex(row).online).toBe(true);
  });

  it("returns true for partial match (PAYPALEXPRESS)", () => {
    const row = { Date: "13/02/2026", Description: "PAYPALEXPRESS", Amount: "100" };
    expect(transformAmex(row).online).toBe(true);
  });

  it("returns false for empty string", () => {
    const row = { Date: "13/02/2026", Description: "", Amount: "100" };
    expect(transformAmex(row).online).toBe(false);
  });

  it("returns true if multiple indicators present", () => {
    const row = { Date: "13/02/2026", Description: "AMAZON PAYPAL", Amount: "100" };
    expect(transformAmex(row).online).toBe(true);
  });

  it("returns false for offline merchants", () => {
    const row = { Date: "13/02/2026", Description: "COLES SUPERMARKET", Amount: "100" };
    expect(transformAmex(row).online).toBe(false);
  });
});

describe("cleanDescription", () => {
  it("removes double spaces", () => {
    const row = { Date: "13/02/2026", Description: "WOOLWORTHS  1234", Amount: "100" };
    expect(transformAmex(row).description).toBe("WOOLWORTHS 1234");
  });

  it("removes multiple spaces (3+)", () => {
    const row = { Date: "13/02/2026", Description: "A   B    C", Amount: "100" };
    expect(transformAmex(row).description).toBe("A B C");
  });

  it("trims leading whitespace", () => {
    const row = { Date: "13/02/2026", Description: "  WOOLWORTHS", Amount: "100" };
    expect(transformAmex(row).description).toBe("WOOLWORTHS");
  });

  it("trims trailing whitespace", () => {
    const row = { Date: "13/02/2026", Description: "WOOLWORTHS  ", Amount: "100" };
    expect(transformAmex(row).description).toBe("WOOLWORTHS");
  });

  it("handles empty string", () => {
    const row = { Date: "13/02/2026", Description: "", Amount: "100" };
    expect(transformAmex(row).description).toBe("");
  });

  it("handles single space (unchanged)", () => {
    const row = { Date: "13/02/2026", Description: "A B", Amount: "100" };
    expect(transformAmex(row).description).toBe("A B");
  });

  it("handles no spaces (unchanged)", () => {
    const row = { Date: "13/02/2026", Description: "WOOLWORTHS", Amount: "100" };
    expect(transformAmex(row).description).toBe("WOOLWORTHS");
  });

  it("handles tabs and newlines", () => {
    const row = { Date: "13/02/2026", Description: "A\t\tB\n\nC", Amount: "100" };
    expect(transformAmex(row).description).toBe("A B C");
  });

  it("handles whitespace-only string", () => {
    const row = { Date: "13/02/2026", Description: "   ", Amount: "100" };
    expect(transformAmex(row).description).toBe("");
  });

  it("preserves single spaces between words", () => {
    const row = { Date: "13/02/2026", Description: "NORTH SYDNEY STORE", Amount: "100" };
    expect(transformAmex(row).description).toBe("NORTH SYDNEY STORE");
  });
});

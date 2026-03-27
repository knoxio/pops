import { describe, it, expect } from "vitest";
import { matchEntity, type EntityLookupMap, type AliasMap } from "./entity-matcher.js";
import type { EntityEntry } from "./entity-lookup.js";

/**
 * Unit tests for entity matching functions.
 * Tests the 5-stage matching pipeline: aliases → exact → prefix → contains → punctuation stripping.
 */

/** Helper to build EntityLookupMap from name → id record */
function buildLookup(record: Record<string, string>): EntityLookupMap {
  const map = new Map<string, EntityEntry>();
  for (const [name, id] of Object.entries(record)) {
    map.set(name.toLowerCase(), { id, name });
  }
  return map;
}

/** Helper to build AliasMap from alias → entity name record */
function buildAliases(record: Record<string, string>): AliasMap {
  const map = new Map<string, string>();
  for (const [alias, name] of Object.entries(record)) {
    map.set(alias.toLowerCase(), name);
  }
  return map;
}

const emptyAliases = new Map<string, string>();

describe("matchEntity", () => {
  const entityLookup = buildLookup({
    Woolworths: "woolworths-id",
    Coles: "coles-id",
    "Roastville Cafe": "roastville-id",
    "Transport for NSW": "transport-nsw-id",
    Netflix: "netflix-id",
    "McDonald's": "mcdonalds-id",
  });

  const aliases = buildAliases({
    TRANSPORTFORNSWTRAVEL: "Transport for NSW",
    "WOW ": "Woolworths",
    MACCAS: "McDonald's",
  });

  describe("Stage 1: Alias matching", () => {
    it("matches via alias (case-insensitive)", () => {
      const result = matchEntity("TRANSPORTFORNSWTRAVEL CARD 1234", entityLookup, aliases);

      expect(result).not.toBeNull();
      expect(result?.entityName).toBe("Transport for NSW");
      expect(result?.entityId).toBe("transport-nsw-id");
      expect(result?.matchType).toBe("alias");
    });

    it("matches alias with lowercase input", () => {
      const result = matchEntity("transportfornswtravel card 1234", entityLookup, aliases);

      expect(result).not.toBeNull();
      expect(result?.matchType).toBe("alias");
    });

    it("matches alias when it's a substring", () => {
      const result = matchEntity("PREFIX TRANSPORTFORNSWTRAVEL SUFFIX", entityLookup, aliases);

      expect(result).not.toBeNull();
      expect(result?.matchType).toBe("alias");
    });

    it("prioritizes alias over exact match", () => {
      const lookup = buildLookup({
        WOW: "wow-id",
        Woolworths: "woolworths-id",
      });
      const result = matchEntity("WOW 1234", lookup, aliases);

      expect(result?.entityName).toBe("Woolworths"); // Alias wins
      expect(result?.matchType).toBe("alias");
    });

    it("returns null when alias points to non-existent entity", () => {
      const badAliases = buildAliases({ FOO: "Non Existent Entity" });
      const result = matchEntity("FOO BAR", entityLookup, badAliases);

      expect(result).toBeNull();
    });

    it("handles empty aliases", () => {
      const result = matchEntity("WOOLWORTHS", entityLookup, emptyAliases);

      expect(result?.matchType).toBe("exact"); // Falls through to stage 2
    });
  });

  describe("Stage 2: Exact matching", () => {
    it("matches exact entity name (case-insensitive)", () => {
      const result = matchEntity("WOOLWORTHS", entityLookup, emptyAliases);

      expect(result).not.toBeNull();
      expect(result?.entityName).toBe("Woolworths");
      expect(result?.entityId).toBe("woolworths-id");
      expect(result?.matchType).toBe("exact");
    });

    it("matches exact with lowercase input", () => {
      const result = matchEntity("woolworths", entityLookup, emptyAliases);

      expect(result?.matchType).toBe("exact");
    });

    it("matches exact with mixed case", () => {
      const result = matchEntity("WoOlWoRtHs", entityLookup, emptyAliases);

      expect(result?.matchType).toBe("exact");
    });

    it("trims whitespace before matching", () => {
      const result = matchEntity("  WOOLWORTHS  ", entityLookup, emptyAliases);

      expect(result?.matchType).toBe("exact");
    });

    it("does not match partial string", () => {
      const result = matchEntity("WOOLWORTHS 1234", entityLookup, emptyAliases);

      expect(result?.matchType).not.toBe("exact");
      expect(result?.matchType).toBe("prefix"); // Falls to stage 3
    });
  });

  describe("Stage 3: Prefix matching", () => {
    it("matches when description starts with entity name", () => {
      const result = matchEntity("WOOLWORTHS 1234 SYDNEY", entityLookup, emptyAliases);

      expect(result).not.toBeNull();
      expect(result?.entityName).toBe("Woolworths");
      expect(result?.matchType).toBe("prefix");
    });

    it("matches longest prefix when multiple entities match", () => {
      const lookup = buildLookup({
        WW: "ww-id",
        Woolworths: "woolworths-id",
      });
      const result = matchEntity("WOOLWORTHS 1234", lookup, emptyAliases);

      expect(result?.entityName).toBe("Woolworths"); // Longest wins
    });

    it("allows prefix match for entities < 4 chars", () => {
      const lookup = buildLookup({ WW: "ww-id" });
      const result = matchEntity("WW METRO", lookup, emptyAliases);

      expect(result?.matchType).toBe("prefix");
    });

    it("handles multi-word entity names", () => {
      const result = matchEntity("ROASTVILLE CAFE SYDNEY", entityLookup, emptyAliases);

      expect(result?.entityName).toBe("Roastville Cafe");
      expect(result?.matchType).toBe("prefix");
    });
  });

  describe("Stage 4: Contains matching", () => {
    it("matches when entity name is contained in description", () => {
      const result = matchEntity("STORE WOOLWORTHS METRO", entityLookup, emptyAliases);

      expect(result).not.toBeNull();
      expect(result?.entityName).toBe("Woolworths");
      expect(result?.matchType).toBe("contains");
    });

    it("skips contains match for entities < 4 chars", () => {
      const lookup = buildLookup({ WW: "ww-id" });
      const result = matchEntity("STORE WW METRO", lookup, emptyAliases);

      expect(result).toBeNull(); // Too short for contains
    });

    it("matches longest contains when multiple entities match", () => {
      const lookup = buildLookup({
        CAFE: "cafe-id",
        "ROASTVILLE CAFE": "roastville-id",
      });
      const result = matchEntity("STORE ROASTVILLE CAFE SYDNEY", lookup, emptyAliases);

      expect(result?.entityName).toBe("ROASTVILLE CAFE"); // Longest wins
    });

    it("allows entities with exactly 4 chars", () => {
      const lookup = buildLookup({ CAFE: "cafe-id" });
      const result = matchEntity("STORE CAFE SYDNEY", lookup, emptyAliases);

      expect(result?.matchType).toBe("contains");
    });

    it("matches multi-word entity in middle of description", () => {
      const result = matchEntity("PURCHASE AT ROASTVILLE CAFE SYDNEY", entityLookup, emptyAliases);

      expect(result?.entityName).toBe("Roastville Cafe");
      expect(result?.matchType).toBe("contains");
    });
  });

  describe("Stage 5: Punctuation stripping", () => {
    it("matches after stripping apostrophes", () => {
      const result = matchEntity("MCDONALDS RESTAURANT", entityLookup, emptyAliases);

      expect(result).not.toBeNull();
      expect(result?.entityName).toBe("McDonald's");
      expect(result?.matchType).toBe("prefix");
    });

    it("strips single quote variations", () => {
      const result = matchEntity("MCDONALDS", entityLookup, emptyAliases);

      expect(result?.entityName).toBe("McDonald's");
    });

    it("handles description with apostrophes stripped", () => {
      const lookup = buildLookup({ "Joe's Coffee": "joes-id" });
      const result = matchEntity("JOES COFFEE SHOP", lookup, emptyAliases);

      expect(result?.entityName).toBe("Joe's Coffee");
    });

    it("retries all stages after stripping", () => {
      const result = matchEntity("MCDONALDS 1234", entityLookup, emptyAliases);

      expect(result).not.toBeNull();
      expect(result?.matchType).toBe("prefix");
    });
  });

  describe("No match scenarios", () => {
    it("returns null when no match found", () => {
      const result = matchEntity("UNKNOWN MERCHANT", entityLookup, emptyAliases);

      expect(result).toBeNull();
    });

    it("returns null for empty description", () => {
      const result = matchEntity("", entityLookup, emptyAliases);

      expect(result).toBeNull();
    });

    it("returns null for whitespace-only description", () => {
      const result = matchEntity("   ", entityLookup, emptyAliases);

      expect(result).toBeNull();
    });

    it("returns null with empty entity lookup", () => {
      const result = matchEntity("WOOLWORTHS", new Map(), emptyAliases);

      expect(result).toBeNull();
    });

    it("returns null for very short description (< 4 chars) with no exact/prefix", () => {
      const result = matchEntity("ABC", entityLookup, emptyAliases);

      expect(result).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("handles special characters in description", () => {
      const result = matchEntity("WOOLWORTHS-METRO-1234", entityLookup, emptyAliases);

      expect(result?.matchType).toBe("prefix");
    });

    it("handles numbers in description", () => {
      const result = matchEntity("WOOLWORTHS 1234 5678", entityLookup, emptyAliases);

      expect(result?.matchType).toBe("prefix");
    });

    it("handles very long description", () => {
      const longDesc = "WOOLWORTHS " + "X".repeat(500);
      const result = matchEntity(longDesc, entityLookup, emptyAliases);

      expect(result?.matchType).toBe("prefix");
    });

    it("handles entity names with spaces", () => {
      const result = matchEntity("TRANSPORT FOR NSW OPAL", entityLookup, emptyAliases);

      expect(result?.entityName).toBe("Transport for NSW");
    });

    it("preserves original case in returned entityName", () => {
      const lookup = buildLookup({
        "MiXeD CaSe": "mixed-id",
      });
      const result = matchEntity("mixed case", lookup, emptyAliases);

      expect(result?.entityName).toBe("MiXeD CaSe");
      expect(result?.matchType).toBe("exact");
    });

    it("handles alias that matches multiple entity lookups", () => {
      const lookup = buildLookup({
        Woolworths: "woolworths-id",
        "Woolworths Metro": "woolworths-metro-id",
      });
      const result = matchEntity("WOW 1234", lookup, aliases);

      expect(result?.entityName).toBe("Woolworths");
      expect(result?.matchType).toBe("alias");
    });
  });
});

describe("findByName (via matchEntity alias stage)", () => {
  it("finds entity case-insensitively", () => {
    const lookup = buildLookup({ Woolworths: "woolworths-id" });
    const aliases = buildAliases({ TEST: "woolworths" });

    const result = matchEntity("TEST", lookup, aliases);

    expect(result?.entityId).toBe("woolworths-id");
  });

  it("returns null for non-existent entity", () => {
    const lookup = buildLookup({ Woolworths: "woolworths-id" });
    const aliases = buildAliases({ TEST: "NonExistent" });

    const result = matchEntity("TEST", lookup, aliases);

    expect(result).toBeNull();
  });

  it("returns null with empty lookup", () => {
    const aliases = buildAliases({ TEST: "Woolworths" });

    const result = matchEntity("TEST", new Map(), aliases);

    expect(result).toBeNull();
  });
});

describe("tryMatch (via matchEntity)", () => {
  const entityLookup = buildLookup({
    Woolworths: "woolworths-id",
    "WW Metro": "ww-metro-id",
    Coles: "coles-id",
  });

  it("returns exact match before prefix", () => {
    const lookup = buildLookup({
      WW: "ww-id",
      "WW Metro": "ww-metro-id",
    });
    const result = matchEntity("WW", lookup, emptyAliases);

    expect(result?.matchType).toBe("exact");
    expect(result?.entityName).toBe("WW");
  });

  it("returns prefix match before contains", () => {
    const lookup = buildLookup({
      CAFE: "cafe-id",
      "ROASTVILLE CAFE": "roastville-id",
    });
    const result = matchEntity("ROASTVILLE CAFE SYDNEY", lookup, emptyAliases);

    expect(result?.matchType).toBe("prefix");
    expect(result?.entityName).toBe("ROASTVILLE CAFE");
  });

  it("returns contains match when no exact/prefix", () => {
    const result = matchEntity("STORE WOOLWORTHS SYDNEY", entityLookup, emptyAliases);

    expect(result?.matchType).toBe("contains");
  });

  it("returns null when normalized string is empty", () => {
    const result = matchEntity("", entityLookup, emptyAliases);

    expect(result).toBeNull();
  });

  it("returns null when no stage matches", () => {
    const result = matchEntity("UNKNOWN", entityLookup, emptyAliases);

    expect(result).toBeNull();
  });

  it("selects longest prefix among multiple matches", () => {
    const lookup = buildLookup({
      W: "w-id",
      WW: "ww-id",
      "WW Metro": "ww-metro-id",
    });
    const result = matchEntity("WW METRO SYDNEY", lookup, emptyAliases);

    expect(result?.entityName).toBe("WW Metro");
  });

  it("selects longest contains among multiple matches", () => {
    const lookup = buildLookup({
      WOOL: "wool-id",
      WOOLWORTHS: "woolworths-id",
    });
    const result = matchEntity("STORE WOOLWORTHS SYDNEY", lookup, emptyAliases);

    expect(result?.entityName).toBe("WOOLWORTHS");
  });
});

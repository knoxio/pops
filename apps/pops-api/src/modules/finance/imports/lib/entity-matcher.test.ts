import { describe, it, expect } from "vitest";
import { matchEntity, type EntityLookup } from "./entity-matcher.js";

/**
 * Unit tests for entity matching functions.
 * Tests the 5-stage matching pipeline: aliases → exact → prefix → contains → punctuation stripping.
 */

describe("matchEntity", () => {
  const entityLookup: EntityLookup = {
    Woolworths: "woolworths-id",
    Coles: "coles-id",
    "Roastville Cafe": "roastville-id",
    "Transport for NSW": "transport-nsw-id",
    Netflix: "netflix-id",
    "McDonald's": "mcdonalds-id",
  };

  const aliases: Record<string, string> = {
    TRANSPORTFORNSWTRAVEL: "Transport for NSW",
    "WOW ": "Woolworths",
    MACCAS: "McDonald's",
  };

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
      const lookup: EntityLookup = {
        WOW: "wow-id",
        Woolworths: "woolworths-id",
      };
      const result = matchEntity("WOW 1234", lookup, aliases);

      expect(result?.entityName).toBe("Woolworths"); // Alias wins
      expect(result?.matchType).toBe("alias");
    });

    it("returns null when alias points to non-existent entity", () => {
      const badAliases = { FOO: "Non Existent Entity" };
      const result = matchEntity("FOO BAR", entityLookup, badAliases);

      expect(result).toBeNull();
    });

    it("handles empty aliases", () => {
      const result = matchEntity("WOOLWORTHS", entityLookup, {});

      expect(result?.matchType).toBe("exact"); // Falls through to stage 2
    });
  });

  describe("Stage 2: Exact matching", () => {
    it("matches exact entity name (case-insensitive)", () => {
      const result = matchEntity("WOOLWORTHS", entityLookup, {});

      expect(result).not.toBeNull();
      expect(result?.entityName).toBe("Woolworths");
      expect(result?.entityId).toBe("woolworths-id");
      expect(result?.matchType).toBe("exact");
    });

    it("matches exact with lowercase input", () => {
      const result = matchEntity("woolworths", entityLookup, {});

      expect(result?.matchType).toBe("exact");
    });

    it("matches exact with mixed case", () => {
      const result = matchEntity("WoOlWoRtHs", entityLookup, {});

      expect(result?.matchType).toBe("exact");
    });

    it("trims whitespace before matching", () => {
      const result = matchEntity("  WOOLWORTHS  ", entityLookup, {});

      expect(result?.matchType).toBe("exact");
    });

    it("does not match partial string", () => {
      const result = matchEntity("WOOLWORTHS 1234", entityLookup, {});

      expect(result?.matchType).not.toBe("exact");
      expect(result?.matchType).toBe("prefix"); // Falls to stage 3
    });
  });

  describe("Stage 3: Prefix matching", () => {
    it("matches when description starts with entity name", () => {
      const result = matchEntity("WOOLWORTHS 1234 SYDNEY", entityLookup, {});

      expect(result).not.toBeNull();
      expect(result?.entityName).toBe("Woolworths");
      expect(result?.matchType).toBe("prefix");
    });

    it("matches longest prefix when multiple entities match", () => {
      const lookup: EntityLookup = {
        WW: "ww-id",
        Woolworths: "woolworths-id",
      };
      const result = matchEntity("WOOLWORTHS 1234", lookup, {});

      expect(result?.entityName).toBe("Woolworths"); // Longest wins
    });

    it("allows prefix match for entities < 4 chars", () => {
      const lookup: EntityLookup = {
        WW: "ww-id",
      };
      const result = matchEntity("WW METRO", lookup, {});

      expect(result?.matchType).toBe("prefix");
    });

    it("handles multi-word entity names", () => {
      const result = matchEntity("ROASTVILLE CAFE SYDNEY", entityLookup, {});

      expect(result?.entityName).toBe("Roastville Cafe");
      expect(result?.matchType).toBe("prefix");
    });
  });

  describe("Stage 4: Contains matching", () => {
    it("matches when entity name is contained in description", () => {
      const result = matchEntity("STORE WOOLWORTHS METRO", entityLookup, {});

      expect(result).not.toBeNull();
      expect(result?.entityName).toBe("Woolworths");
      expect(result?.matchType).toBe("contains");
    });

    it("skips contains match for entities < 4 chars", () => {
      const lookup: EntityLookup = {
        WW: "ww-id",
      };
      const result = matchEntity("STORE WW METRO", lookup, {});

      expect(result).toBeNull(); // Too short for contains
    });

    it("matches longest contains when multiple entities match", () => {
      const lookup: EntityLookup = {
        CAFE: "cafe-id",
        "ROASTVILLE CAFE": "roastville-id",
      };
      const result = matchEntity("STORE ROASTVILLE CAFE SYDNEY", lookup, {});

      expect(result?.entityName).toBe("ROASTVILLE CAFE"); // Longest wins
    });

    it("allows entities with exactly 4 chars", () => {
      const lookup: EntityLookup = {
        CAFE: "cafe-id",
      };
      const result = matchEntity("STORE CAFE SYDNEY", lookup, {});

      expect(result?.matchType).toBe("contains");
    });

    it("matches multi-word entity in middle of description", () => {
      const result = matchEntity("PURCHASE AT ROASTVILLE CAFE SYDNEY", entityLookup, {});

      expect(result?.entityName).toBe("Roastville Cafe");
      expect(result?.matchType).toBe("contains");
    });
  });

  describe("Stage 5: Punctuation stripping", () => {
    it("matches after stripping apostrophes", () => {
      const result = matchEntity("MCDONALDS RESTAURANT", entityLookup, {});

      expect(result).not.toBeNull();
      expect(result?.entityName).toBe("McDonald's");
      expect(result?.matchType).toBe("prefix"); // Prefix because description starts with entity
    });

    it("strips single quote variations", () => {
      const result = matchEntity("MCDONALDS", entityLookup, {});

      expect(result?.entityName).toBe("McDonald's");
    });

    it("handles description with apostrophes stripped", () => {
      const lookup: EntityLookup = {
        "Joe's Coffee": "joes-id",
      };
      const result = matchEntity("JOES COFFEE SHOP", lookup, {});

      expect(result?.entityName).toBe("Joe's Coffee");
    });

    it("retries all stages after stripping", () => {
      // Entity has apostrophe, description doesn't
      const result = matchEntity("MCDONALDS 1234", entityLookup, {});

      expect(result).not.toBeNull();
      expect(result?.matchType).toBe("prefix"); // Prefix match after stripping
    });
  });

  describe("No match scenarios", () => {
    it("returns null when no match found", () => {
      const result = matchEntity("UNKNOWN MERCHANT", entityLookup, {});

      expect(result).toBeNull();
    });

    it("returns null for empty description", () => {
      const result = matchEntity("", entityLookup, {});

      expect(result).toBeNull();
    });

    it("returns null for whitespace-only description", () => {
      const result = matchEntity("   ", entityLookup, {});

      expect(result).toBeNull();
    });

    it("returns null with empty entity lookup", () => {
      const result = matchEntity("WOOLWORTHS", {}, {});

      expect(result).toBeNull();
    });

    it("returns null for very short description (< 4 chars) with no exact/prefix", () => {
      const result = matchEntity("ABC", entityLookup, {});

      expect(result).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("handles special characters in description", () => {
      const result = matchEntity("WOOLWORTHS-METRO-1234", entityLookup, {});

      expect(result?.matchType).toBe("prefix");
    });

    it("handles numbers in description", () => {
      const result = matchEntity("WOOLWORTHS 1234 5678", entityLookup, {});

      expect(result?.matchType).toBe("prefix");
    });

    it("handles very long description", () => {
      const longDesc = "WOOLWORTHS " + "X".repeat(500);
      const result = matchEntity(longDesc, entityLookup, {});

      expect(result?.matchType).toBe("prefix");
    });

    it("handles entity names with spaces", () => {
      const result = matchEntity("TRANSPORT FOR NSW OPAL", entityLookup, {});

      expect(result?.entityName).toBe("Transport for NSW");
    });

    it("handles case sensitivity correctly", () => {
      const lookup: EntityLookup = {
        woolworths: "woolworths-id",
        COLES: "coles-id",
        "MiXeD CaSe": "mixed-id",
      };
      const result1 = matchEntity("WOOLWORTHS", lookup, {});
      const result2 = matchEntity("coles", lookup, {});
      const result3 = matchEntity("mixed case", lookup, {});

      expect(result1?.matchType).toBe("exact");
      expect(result2?.matchType).toBe("exact");
      expect(result3?.matchType).toBe("exact");
    });

    it("handles duplicate entity names (last wins in lookup)", () => {
      // This tests the behavior when lookup has duplicates (shouldn't happen in practice)
      const lookup: EntityLookup = {
        Woolworths: "woolworths-id-1",
        WOOLWORTHS: "woolworths-id-2", // Case variation
      };
      const result = matchEntity("WOOLWORTHS", lookup, {});

      expect(result).not.toBeNull();
      // Will match one of them (order depends on Object.entries iteration)
    });

    it("handles alias that matches multiple entity lookups", () => {
      const lookup: EntityLookup = {
        Woolworths: "woolworths-id",
        "Woolworths Metro": "woolworths-metro-id",
      };
      const result = matchEntity("WOW 1234", lookup, aliases);

      expect(result?.entityName).toBe("Woolworths"); // Alias specifies exact entity
      expect(result?.matchType).toBe("alias");
    });

    it("prioritizes longer alias matches", () => {
      const multiAliases: Record<string, string> = {
        WOW: "Coles", // Shorter alias
        "WOW ": "Woolworths", // Longer alias (with space)
      };
      const result = matchEntity("WOW 1234", entityLookup, multiAliases);

      // First matching alias wins (iteration order)
      expect(result).not.toBeNull();
    });

    it("handles entity lookup with null/undefined values gracefully", () => {
      const lookup: Record<string, string | undefined> = {
        Woolworths: "woolworths-id",
        Broken: undefined,
      };
      const result = matchEntity("WOOLWORTHS", lookup as EntityLookup, {});

      expect(result).not.toBeNull();
    });
  });
});

describe("findInLookup (via matchEntity)", () => {
  it("finds entity case-insensitively", () => {
    const lookup: EntityLookup = {
      Woolworths: "woolworths-id",
    };
    const aliases: Record<string, string> = {
      TEST: "woolworths", // Lowercase reference
    };

    const result = matchEntity("TEST", lookup, aliases);

    expect(result?.entityId).toBe("woolworths-id");
  });

  it("returns undefined for non-existent entity", () => {
    const lookup: EntityLookup = {
      Woolworths: "woolworths-id",
    };
    const aliases: Record<string, string> = {
      TEST: "NonExistent",
    };

    const result = matchEntity("TEST", lookup, aliases);

    expect(result).toBeNull();
  });

  it("handles empty lookup", () => {
    const aliases: Record<string, string> = {
      TEST: "Woolworths",
    };

    const result = matchEntity("TEST", {}, aliases);

    expect(result).toBeNull();
  });
});

describe("tryMatch (via matchEntity)", () => {
  const entityLookup: EntityLookup = {
    Woolworths: "woolworths-id",
    "WW Metro": "ww-metro-id",
    Coles: "coles-id",
  };

  it("returns exact match before prefix", () => {
    const lookup: EntityLookup = {
      WW: "ww-id",
      "WW Metro": "ww-metro-id",
    };
    const result = matchEntity("WW", lookup, {});

    expect(result?.matchType).toBe("exact");
    expect(result?.entityName).toBe("WW");
  });

  it("returns prefix match before contains", () => {
    const lookup: EntityLookup = {
      CAFE: "cafe-id",
      "ROASTVILLE CAFE": "roastville-id",
    };
    const result = matchEntity("ROASTVILLE CAFE SYDNEY", lookup, {});

    expect(result?.matchType).toBe("prefix");
    expect(result?.entityName).toBe("ROASTVILLE CAFE");
  });

  it("returns contains match when no exact/prefix", () => {
    const result = matchEntity("STORE WOOLWORTHS SYDNEY", entityLookup, {});

    expect(result?.matchType).toBe("contains");
  });

  it("returns null when normalized string is empty", () => {
    const result = matchEntity("", entityLookup, {});

    expect(result).toBeNull();
  });

  it("returns null when no stage matches", () => {
    const result = matchEntity("UNKNOWN", entityLookup, {});

    expect(result).toBeNull();
  });

  it("selects longest prefix among multiple matches", () => {
    const lookup: EntityLookup = {
      W: "w-id",
      WW: "ww-id",
      "WW Metro": "ww-metro-id",
    };
    const result = matchEntity("WW METRO SYDNEY", lookup, {});

    expect(result?.entityName).toBe("WW Metro"); // Longest prefix
  });

  it("selects longest contains among multiple matches", () => {
    const lookup: EntityLookup = {
      WOOL: "wool-id",
      WOOLWORTHS: "woolworths-id",
    };
    const result = matchEntity("STORE WOOLWORTHS SYDNEY", lookup, {});

    expect(result?.entityName).toBe("WOOLWORTHS"); // Longest contains
  });
});

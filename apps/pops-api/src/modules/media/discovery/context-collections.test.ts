import { describe, it, expect } from "vitest";
import { CONTEXT_COLLECTIONS, getActiveCollections } from "./context-collections.js";

/** Helper — get collection by id. */
function findCollection(id: string) {
  return CONTEXT_COLLECTIONS.find((c) => c.id === id)!;
}

describe("CONTEXT_COLLECTIONS", () => {
  it("defines 7 collections", () => {
    expect(CONTEXT_COLLECTIONS).toHaveLength(7);
  });

  it("each collection has required fields", () => {
    for (const col of CONTEXT_COLLECTIONS) {
      expect(col.id).toBeTruthy();
      expect(col.title).toBeTruthy();
      expect(col.emoji).toBeTruthy();
      expect(typeof col.trigger).toBe("function");
      expect(Array.isArray(col.genreIds)).toBe(true);
      expect(Array.isArray(col.keywordIds)).toBe(true);
    }
  });
});

describe("trigger — date-night", () => {
  const col = findCollection("date-night");

  it("matches Friday 7pm", () => {
    expect(col.trigger(19, 6, 5)).toBe(true);
  });

  it("matches Saturday 6pm", () => {
    expect(col.trigger(18, 6, 6)).toBe(true);
  });

  it("rejects Thursday 7pm", () => {
    expect(col.trigger(19, 6, 4)).toBe(false);
  });

  it("rejects Friday 5pm (too early)", () => {
    expect(col.trigger(17, 6, 5)).toBe(false);
  });

  it("rejects Friday 11pm (too late)", () => {
    expect(col.trigger(23, 6, 5)).toBe(false);
  });
});

describe("trigger — sunday-flicks", () => {
  const col = findCollection("sunday-flicks");

  it("matches Sunday at any hour", () => {
    expect(col.trigger(8, 3, 0)).toBe(true);
    expect(col.trigger(23, 11, 0)).toBe(true);
  });

  it("rejects Monday", () => {
    expect(col.trigger(12, 3, 1)).toBe(false);
  });
});

describe("trigger — late-night", () => {
  const col = findCollection("late-night");

  it("matches 10pm", () => {
    expect(col.trigger(22, 6, 3)).toBe(true);
  });

  it("matches midnight", () => {
    expect(col.trigger(0, 6, 3)).toBe(true);
  });

  it("matches 1am", () => {
    expect(col.trigger(1, 6, 3)).toBe(true);
  });

  it("matches 2am (boundary)", () => {
    expect(col.trigger(2, 6, 3)).toBe(true);
  });

  it("rejects 3am", () => {
    expect(col.trigger(3, 6, 3)).toBe(false);
  });

  it("rejects 2pm", () => {
    expect(col.trigger(14, 6, 3)).toBe(false);
  });

  it("rejects 9pm", () => {
    expect(col.trigger(21, 6, 3)).toBe(false);
  });
});

describe("trigger — halloween", () => {
  const col = findCollection("halloween");

  it("matches any time in October", () => {
    expect(col.trigger(12, 10, 2)).toBe(true);
  });

  it("rejects November", () => {
    expect(col.trigger(12, 11, 2)).toBe(false);
  });
});

describe("trigger — christmas", () => {
  const col = findCollection("christmas");

  it("matches December", () => {
    expect(col.trigger(12, 12, 4)).toBe(true);
  });

  it("rejects January", () => {
    expect(col.trigger(12, 1, 4)).toBe(false);
  });
});

describe("trigger — oscar-season", () => {
  const col = findCollection("oscar-season");

  it("matches February", () => {
    expect(col.trigger(12, 2, 3)).toBe(true);
  });

  it("matches March", () => {
    expect(col.trigger(12, 3, 3)).toBe(true);
  });

  it("rejects April", () => {
    expect(col.trigger(12, 4, 3)).toBe(false);
  });
});

describe("trigger — rainy-day", () => {
  const col = findCollection("rainy-day");

  it("always matches", () => {
    expect(col.trigger(12, 6, 3)).toBe(true);
    expect(col.trigger(0, 1, 0)).toBe(true);
  });
});

describe("getActiveCollections", () => {
  it("returns exactly 2 collections", () => {
    const result = getActiveCollections(12, 6, 3); // Wed noon in June
    expect(result).toHaveLength(2);
  });

  it("fills with rainy-day fallback when no triggers match", () => {
    // Wednesday 3pm in June — nothing matches except rainy-day
    const result = getActiveCollections(15, 6, 3);
    expect(result[0]!.id).toBe("rainy-day");
    expect(result[1]!.id).toBe("rainy-day");
  });

  it("includes rainy-day when only 1 non-fallback matches", () => {
    // Sunday 3pm in June — only sunday-flicks matches
    const result = getActiveCollections(15, 6, 0);
    const ids = result.map((c) => c.id);
    expect(ids).toContain("sunday-flicks");
    expect(ids).toContain("rainy-day");
  });

  it("returns 2 non-fallback when 2+ match", () => {
    // Friday 10pm in October — date-night + late-night + halloween all match
    const result = getActiveCollections(22, 10, 5);
    expect(result).toHaveLength(2);
    // Should not include rainy-day since 2 non-fallback match
    const ids = result.map((c) => c.id);
    expect(ids).not.toContain("rainy-day");
  });

  it("caps at 2 even when more than 2 match", () => {
    // Sunday midnight in October — sunday-flicks + late-night + halloween
    const result = getActiveCollections(0, 10, 0);
    expect(result).toHaveLength(2);
  });

  it("never returns more than 2", () => {
    // Sunday midnight in March — sunday-flicks + late-night + oscar-season
    const result = getActiveCollections(0, 3, 0);
    expect(result).toHaveLength(2);
  });
});

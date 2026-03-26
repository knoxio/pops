import { describe, it, expect } from "vitest";
import { formatRuntime, formatCurrency, formatLanguage } from "./format";

describe("formatRuntime", () => {
  it("formats hours and minutes", () => {
    expect(formatRuntime(148)).toBe("2h 28m");
  });

  it("formats exactly one hour", () => {
    expect(formatRuntime(60)).toBe("1h 0m");
  });

  it("formats minutes only when under an hour", () => {
    expect(formatRuntime(45)).toBe("45m");
  });

  it("formats zero minutes", () => {
    expect(formatRuntime(0)).toBe("0m");
  });
});

describe("formatCurrency", () => {
  it("formats large budgets", () => {
    expect(formatCurrency(150000000)).toBe("$150,000,000");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0");
  });
});

describe("formatLanguage", () => {
  it("maps en to English", () => {
    expect(formatLanguage("en")).toBe("English");
  });

  it("maps ja to Japanese", () => {
    expect(formatLanguage("ja")).toBe("Japanese");
  });

  it("maps fr to French", () => {
    expect(formatLanguage("fr")).toBe("French");
  });

  it("maps ko to Korean", () => {
    expect(formatLanguage("ko")).toBe("Korean");
  });

  it("maps zh to Chinese", () => {
    expect(formatLanguage("zh")).toBe("Chinese");
  });

  it("is case-insensitive", () => {
    expect(formatLanguage("EN")).toBe("English");
    expect(formatLanguage("En")).toBe("English");
  });

  it("returns uppercased code for unknown languages", () => {
    expect(formatLanguage("xx")).toBe("XX");
  });
});

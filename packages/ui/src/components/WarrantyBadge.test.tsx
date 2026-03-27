import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getWarrantyStatus } from "./WarrantyBadge";

describe("getWarrantyStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns expired for past dates", () => {
    const result = getWarrantyStatus("2026-03-25");
    expect(result.state).toBe("expired");
    expect(result.label).toBe("Expired");
  });

  it("returns expiring with 0 days when expiry is today", () => {
    const result = getWarrantyStatus("2026-03-26");
    expect(result.state).toBe("expiring");
    expect(result.label).toBe("Expires in 0 days");
  });

  it("returns expiring with 1 day remaining", () => {
    const result = getWarrantyStatus("2026-03-27");
    expect(result.state).toBe("expiring");
    expect(result.label).toBe("Expires in 1 days");
  });

  it("returns expiring with 45 days remaining", () => {
    const result = getWarrantyStatus("2026-05-10");
    expect(result.state).toBe("expiring");
    expect(result.label).toBe("Expires in 45 days");
  });

  it("returns expiring with 89 days remaining", () => {
    const result = getWarrantyStatus("2026-06-23");
    expect(result.state).toBe("expiring");
    expect(result.label).toBe("Expires in 89 days");
  });

  it("returns expiring at 90-day boundary", () => {
    const result = getWarrantyStatus("2026-06-24");
    expect(result.state).toBe("expiring");
    expect(result.label).toBe("Expires in 90 days");
  });

  it("returns active for warranty beyond 90 days", () => {
    const result = getWarrantyStatus("2026-06-25");
    expect(result.state).toBe("active");
    expect(result.label).toMatch(/^Warranty until /);
  });

  it("returns none when warrantyExpiry is null", () => {
    const result = getWarrantyStatus(null);
    expect(result.state).toBe("none");
    expect(result.label).toBe("No warranty");
  });

  it("returns active with formatted date for far future", () => {
    const result = getWarrantyStatus("2027-12-31");
    expect(result.state).toBe("active");
    expect(result.label).toMatch(/Warranty until.*2027/);
  });
});

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type BetterSqlite3 from "better-sqlite3";

import { assertNotProduction, assertLowRecordCount } from "./guard.js";

describe("assertNotProduction", () => {
  const originalEnv = process.env["NODE_ENV"];

  afterEach(() => {
    process.env["NODE_ENV"] = originalEnv;
  });

  it("exits with code 1 when NODE_ENV is production", () => {
    process.env["NODE_ENV"] = "production";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    assertNotProduction();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("NODE_ENV is 'production'")
    );

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("does not exit when NODE_ENV is development", () => {
    process.env["NODE_ENV"] = "development";
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    assertNotProduction();
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("does not exit when NODE_ENV is undefined", () => {
    delete process.env["NODE_ENV"];
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    assertNotProduction();
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("does not exit when NODE_ENV is test", () => {
    process.env["NODE_ENV"] = "test";
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    assertNotProduction();
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });
});

describe("assertLowRecordCount", () => {
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  function createMockDb(count: number): BetterSqlite3.Database {
    return {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({ count }),
      }),
      close: vi.fn(),
    } as unknown as BetterSqlite3.Database;
  }

  it("allows execution when count is below threshold", () => {
    const db = createMockDb(50);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    assertLowRecordCount(db);
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("allows execution when count equals threshold", () => {
    const db = createMockDb(1000);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    assertLowRecordCount(db);
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("blocks when count exceeds threshold", () => {
    const db = createMockDb(1001);
    process.argv = ["node", "script.ts"];
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    assertLowRecordCount(db);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("1001 transactions")
    );

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("allows with --force when count exceeds threshold", () => {
    const db = createMockDb(5000);
    process.argv = ["node", "script.ts", "--force"];
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    assertLowRecordCount(db);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("--force")
    );

    exitSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("respects custom threshold", () => {
    const db = createMockDb(101);
    process.argv = ["node", "script.ts"];
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    assertLowRecordCount(db, 100);
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("closes database on block", () => {
    const db = createMockDb(2000);
    process.argv = ["node", "script.ts"];
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    assertLowRecordCount(db);
    expect(db.close).toHaveBeenCalled();

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

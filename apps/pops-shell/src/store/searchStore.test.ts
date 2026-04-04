import { describe, it, expect, beforeEach } from "vitest";
import { useSearchStore } from "@/store/searchStore";

describe("searchStore", () => {
  beforeEach(() => {
    useSearchStore.setState({ query: "", isOpen: false });
  });

  it("defaults to empty query and closed", () => {
    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().isOpen).toBe(false);
  });

  it("setQuery updates query and opens when non-empty", () => {
    useSearchStore.getState().setQuery("test");
    expect(useSearchStore.getState().query).toBe("test");
    expect(useSearchStore.getState().isOpen).toBe(true);
  });

  it("setQuery closes when empty", () => {
    useSearchStore.getState().setQuery("test");
    useSearchStore.getState().setQuery("");
    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().isOpen).toBe(false);
  });

  it("clear resets query and closes", () => {
    useSearchStore.getState().setQuery("hello");
    useSearchStore.getState().clear();
    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().isOpen).toBe(false);
  });

  it("setOpen controls isOpen independently", () => {
    useSearchStore.getState().setOpen(true);
    expect(useSearchStore.getState().isOpen).toBe(true);

    useSearchStore.getState().setOpen(false);
    expect(useSearchStore.getState().isOpen).toBe(false);
  });
});

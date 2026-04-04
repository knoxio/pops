import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import {
  registerResultComponent,
  getResultComponent,
  GenericResultComponent,
  _clearRegistry,
} from "./result-component-registry";

beforeEach(() => {
  _clearRegistry();
});

describe("registerResultComponent", () => {
  it("stores a component for a domain", () => {
    const FakeComponent = () => null;
    registerResultComponent("test-register", FakeComponent);
    expect(getResultComponent("test-register")).toBe(FakeComponent);
  });
});

describe("getResultComponent", () => {
  it("returns the registered component for a known domain", () => {
    const FakeComponent = () => null;
    registerResultComponent("test-lookup", FakeComponent);
    expect(getResultComponent("test-lookup")).toBe(FakeComponent);
  });

  it("returns GenericResultComponent for an unknown domain", () => {
    expect(getResultComponent("totally-unknown-domain")).toBe(GenericResultComponent);
  });

  it("overwrites a previous registration for the same domain", () => {
    const First = () => null;
    const Second = () => null;
    registerResultComponent("test-overwrite", First);
    registerResultComponent("test-overwrite", Second);
    expect(getResultComponent("test-overwrite")).toBe(Second);
  });
});

describe("GenericResultComponent", () => {
  it("renders the first string value found in data", () => {
    const { getByText } = render(<GenericResultComponent data={{ title: "Hello World" }} />);
    expect(getByText("Hello World")).toBeInTheDocument();
  });

  it("renders an empty span when data has no string fields", () => {
    const { container } = render(<GenericResultComponent data={{ count: 42, active: true }} />);
    expect(container.textContent).toBe("");
  });

  it("renders the first string value when data has mixed field types", () => {
    const { getByText } = render(
      <GenericResultComponent data={{ id: 1, name: "Widget", score: 9.5 }} />
    );
    expect(getByText("Widget")).toBeInTheDocument();
  });
});

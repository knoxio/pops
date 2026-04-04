import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppContextProvider } from "./AppContextProvider";
import { useCurrentApp, useCurrentEntity, useSetPageContext } from "./hooks";
import type { SetPageContextOptions } from "./hooks";

/** Renders children inside a MemoryRouter + AppContextProvider at the given path. */
function renderAt(path: string, ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppContextProvider>{ui}</AppContextProvider>
    </MemoryRouter>
  );
}

/** Displays the value of useCurrentApp. */
function AppDisplay() {
  const app = useCurrentApp();
  return <span data-testid="app">{app ?? "null"}</span>;
}

/** Displays the value of useCurrentEntity. */
function EntityDisplay() {
  const entity = useCurrentEntity();
  return <span data-testid="entity">{entity ? entity.title : "null"}</span>;
}

/** Sets page context and renders both hook values. */
function PageWithHooks(props: SetPageContextOptions) {
  useSetPageContext(props);
  return (
    <div>
      <AppDisplay />
      <EntityDisplay />
    </div>
  );
}

describe("useCurrentApp", () => {
  it("returns the app for a finance path", () => {
    renderAt("/finance/transactions", <AppDisplay />);
    expect(screen.getByTestId("app")).toHaveTextContent("finance");
  });

  it("returns the app for a media path", () => {
    renderAt("/media/library", <AppDisplay />);
    expect(screen.getByTestId("app")).toHaveTextContent("media");
  });

  it("returns null at root", () => {
    renderAt("/", <AppDisplay />);
    expect(screen.getByTestId("app")).toHaveTextContent("null");
  });

  it("returns null for unmatched path", () => {
    renderAt("/settings", <AppDisplay />);
    expect(screen.getByTestId("app")).toHaveTextContent("null");
  });
});

describe("useCurrentEntity", () => {
  it("returns entity on drill-down page", async () => {
    const entity = { uri: "pops:media/movie/42", type: "movie", title: "Fight Club" };
    renderAt("/media", <PageWithHooks page="movie-detail" pageType="drill-down" entity={entity} />);
    await waitFor(() => {
      expect(screen.getByTestId("entity")).toHaveTextContent("Fight Club");
    });
  });

  it("returns null on top-level page even with entity set", async () => {
    const entity = { uri: "pops:media/movie/42", type: "movie", title: "Fight Club" };
    renderAt("/media", <PageWithHooks page="library" pageType="top-level" entity={entity} />);
    await waitFor(() => {
      expect(screen.getByTestId("entity")).toHaveTextContent("null");
    });
  });

  it("returns null when no entity is set", async () => {
    renderAt("/media", <PageWithHooks page="library" />);
    await waitFor(() => {
      expect(screen.getByTestId("entity")).toHaveTextContent("null");
    });
  });

  it("returns null on drill-down page without entity", async () => {
    renderAt("/media", <PageWithHooks page="movie-detail" pageType="drill-down" />);
    await waitFor(() => {
      expect(screen.getByTestId("entity")).toHaveTextContent("null");
    });
  });
});

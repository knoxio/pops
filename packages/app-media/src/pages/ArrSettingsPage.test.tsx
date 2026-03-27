import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockSettingsQuery = vi.fn();
const mockSaveMutate = vi.fn();
const mockTestRadarrQuery = vi.fn();
const mockTestSonarrQuery = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      arr: {
        getSettings: { useQuery: (...args: unknown[]) => mockSettingsQuery(...args) },
        saveSettings: {
          useMutation: () => ({ mutate: mockSaveMutate, isPending: false }),
        },
        testRadarr: { useQuery: (...args: unknown[]) => mockTestRadarrQuery(...args) },
        testSonarr: { useQuery: (...args: unknown[]) => mockTestSonarrQuery(...args) },
      },
    },
  },
}));

vi.mock("@pops/ui", async () => {
  const React = await import("react");
  return {
    Badge: ({ children, className }: { children: React.ReactNode; className?: string }) =>
      React.createElement("span", { "data-testid": "badge", className }, children),
    Button: ({ children, onClick, disabled, ...rest }: Record<string, unknown>) =>
      React.createElement("button", { onClick: onClick as () => void, disabled, ...rest }, children as React.ReactNode),
    Skeleton: ({ className }: { className?: string }) =>
      React.createElement("div", { className: `animate-pulse ${className ?? ""}` }),
    Input: ({ value, onChange, placeholder, disabled, type, className }: Record<string, unknown>) =>
      React.createElement("input", { value: value as string, onChange: onChange as () => void, placeholder: placeholder as string, disabled, type, className }),
    Breadcrumb: ({ children }: { children: React.ReactNode }) =>
      React.createElement("nav", null, children),
    BreadcrumbList: ({ children }: { children: React.ReactNode }) =>
      React.createElement("ol", null, children),
    BreadcrumbItem: ({ children }: { children: React.ReactNode }) =>
      React.createElement("li", null, children),
    BreadcrumbLink: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
    BreadcrumbSeparator: () => React.createElement("span", null, "/"),
    BreadcrumbPage: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
  };
});

import { ArrSettingsPage } from "./ArrSettingsPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/media/arr"]}>
      <ArrSettingsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSettingsQuery.mockReturnValue({
    data: {
      data: {
        radarrUrl: "http://192.168.1.100:7878",
        radarrApiKey: "••••••••",
        radarrHasKey: true,
        sonarrUrl: "http://192.168.1.100:8989",
        sonarrApiKey: "••••••••",
        sonarrHasKey: true,
      },
    },
    isLoading: false,
    refetch: vi.fn(),
  });
  mockTestRadarrQuery.mockReturnValue({ data: null, isFetching: false, refetch: vi.fn() });
  mockTestSonarrQuery.mockReturnValue({ data: null, isFetching: false, refetch: vi.fn() });
});

describe("ArrSettingsPage", () => {
  it("renders page heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Radarr & Sonarr Settings" })).toBeTruthy();
  });

  it("renders Radarr and Sonarr sections", () => {
    renderPage();
    expect(screen.getByText("Radarr")).toBeTruthy();
    expect(screen.getByText("Sonarr")).toBeTruthy();
  });

  it("API key inputs are type=password with no reveal toggle", () => {
    renderPage();
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    expect(passwordInputs.length).toBe(2);
    // No Eye/EyeOff toggle buttons
    expect(screen.queryByLabelText("Show API key")).toBeNull();
    expect(screen.queryByLabelText("Hide API key")).toBeNull();
  });

  it("renders loading skeleton", () => {
    mockSettingsQuery.mockReturnValue({ data: null, isLoading: true, refetch: vi.fn() });
    renderPage();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows URL validation error for invalid URL", async () => {
    mockSettingsQuery.mockReturnValue({
      data: {
        data: {
          radarrUrl: "",
          radarrApiKey: "",
          radarrHasKey: false,
          sonarrUrl: "",
          sonarrApiKey: "",
          sonarrHasKey: false,
        },
      },
      isLoading: false,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    renderPage();

    const urlInputs = screen.getAllByPlaceholderText(/192\.168/);
    await user.type(urlInputs[0]!, "ftp://bad-url");

    expect(screen.getByText("URL must start with http:// or https://")).toBeTruthy();
  });

  it("does not show validation error for valid URL", async () => {
    mockSettingsQuery.mockReturnValue({
      data: {
        data: {
          radarrUrl: "",
          radarrApiKey: "",
          radarrHasKey: false,
          sonarrUrl: "",
          sonarrApiKey: "",
          sonarrHasKey: false,
        },
      },
      isLoading: false,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    renderPage();

    const urlInputs = screen.getAllByPlaceholderText(/192\.168/);
    await user.type(urlInputs[0]!, "http://localhost:7878");

    expect(screen.queryByText("URL must start with http:// or https://")).toBeNull();
  });

  it("renders save and test connection buttons", () => {
    renderPage();
    const saveButtons = screen.getAllByText("Save");
    expect(saveButtons.length).toBe(2);
    const testButtons = screen.getAllByText("Test Connection");
    expect(testButtons.length).toBe(2);
  });
});

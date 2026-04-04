import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockSettingsQuery = vi.fn();
const mockSaveRadarrMutate = vi.fn();
const mockSaveSonarrMutate = vi.fn();
const mockTestRadarrMutate = vi.fn();
const mockTestSonarrMutate = vi.fn();

let saveMutationCallCount = 0;

vi.mock("../lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      media: {
        arr: {
          getConfig: { invalidate: vi.fn() },
        },
      },
    }),
    media: {
      arr: {
        getSettings: { useQuery: (...args: unknown[]) => mockSettingsQuery(...args) },
        saveSettings: {
          useMutation: () => {
            // React calls hooks in stable order on every render.
            // Use % 2 so call 0/2/4... → radarr, call 1/3/5... → sonarr
            // regardless of how many times the component re-renders.
            const mutate =
              saveMutationCallCount % 2 === 0 ? mockSaveRadarrMutate : mockSaveSonarrMutate;
            saveMutationCallCount++;
            return { mutate, isPending: false };
          },
        },
        testRadarr: {
          useMutation: () => ({
            mutate: mockTestRadarrMutate,
            isPending: false,
            data: mockTestRadarrData,
          }),
        },
        testSonarr: {
          useMutation: () => ({
            mutate: mockTestSonarrMutate,
            isPending: false,
            data: mockTestSonarrData,
          }),
        },
      },
    },
  },
}));

let mockTestRadarrData: {
  data: { configured: boolean; connected: boolean; version?: string; error?: string };
} | null = null;
let mockTestSonarrData: {
  data: { configured: boolean; connected: boolean; version?: string; error?: string };
} | null = null;

import { ArrSettingsPage } from "./ArrSettingsPage";

function renderPage() {
  saveMutationCallCount = 0;
  return render(
    <MemoryRouter initialEntries={["/media/arr"]}>
      <ArrSettingsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTestRadarrData = null;
  mockTestSonarrData = null;
  saveMutationCallCount = 0;
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

  it("auto-prepends https:// on blur for URLs without protocol", async () => {
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
    await user.type(urlInputs[0]!, "192.168.1.100:7878");
    await user.tab(); // trigger onBlur → normalizeUrl

    expect(urlInputs[0]).toHaveValue("https://192.168.1.100:7878");
  });

  it("preserves URL with http:// prefix on blur", async () => {
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
    await user.tab(); // trigger onBlur → normalizeUrl

    expect(urlInputs[0]).toHaveValue("http://localhost:7878");
  });

  it("renders save and test connection buttons", () => {
    renderPage();
    const saveButtons = screen.getAllByText("Save");
    expect(saveButtons.length).toBe(2);
    const testButtons = screen.getAllByText("Test Connection");
    expect(testButtons.length).toBe(2);
  });

  it("saves Radarr independently without affecting Sonarr mutation", async () => {
    const user = userEvent.setup();
    renderPage();

    const [radarrSave] = screen.getAllByText("Save");
    await user.click(radarrSave!);

    expect(mockSaveRadarrMutate).toHaveBeenCalledWith(
      expect.objectContaining({ radarrUrl: expect.any(String) })
    );
    expect(mockSaveSonarrMutate).not.toHaveBeenCalled();
  });

  it("saves Sonarr independently without affecting Radarr mutation", async () => {
    const user = userEvent.setup();
    renderPage();

    const [, sonarrSave] = screen.getAllByText("Save");
    await user.click(sonarrSave!);

    expect(mockSaveSonarrMutate).toHaveBeenCalledWith(
      expect.objectContaining({ sonarrUrl: expect.any(String) })
    );
    expect(mockSaveRadarrMutate).not.toHaveBeenCalled();
  });

  it("shows https suggestion when Radarr connection fails on http URL", () => {
    mockTestRadarrData = {
      data: { configured: true, connected: false, error: "Connection refused" },
    };
    renderPage();
    expect(screen.getByText("Connection refused")).toBeTruthy();
    expect(screen.getByText("Try using https:// instead")).toBeTruthy();
  });

  it("does not show https suggestion when URL already uses https", () => {
    mockSettingsQuery.mockReturnValue({
      data: {
        data: {
          radarrUrl: "https://192.168.1.100:7878",
          radarrApiKey: "••••••••",
          radarrHasKey: true,
          sonarrUrl: "https://192.168.1.100:8989",
          sonarrApiKey: "••••••••",
          sonarrHasKey: true,
        },
      },
      isLoading: false,
      refetch: vi.fn(),
    });
    mockTestRadarrData = {
      data: { configured: true, connected: false, error: "Connection refused" },
    };
    renderPage();
    expect(screen.queryByText("Try using https:// instead")).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/popup/App";
import { parseOtpUri } from "../../src/shared/otp";
import type { AppPreferences } from "../../src/shared/preferences";
import type { OtpSecurityState } from "../../src/shared/storage";

const entryA = {
  ...parseOtpUri(
    "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example",
    "upload"
  ),
  createdAt: 10,
  updatedAt: 10,
  sortOrder: 0
};

const entryB = {
  ...parseOtpUri(
    "otpauth://totp/Other:bob@example.com?secret=KRUGS4ZANFZSAYJA&issuer=Other",
    "capture"
  ),
  createdAt: 20,
  updatedAt: 20,
  sortOrder: 1
};

const longEntry = {
  ...parseOtpUri(
    "otpauth://totp/Amazon%20Web%20Services%20Production%20Account:infra-admin@snapotp-company-example.com?secret=JBSWY3DPEHPK3PXP&issuer=Amazon%20Web%20Services%20Production%20Account",
    "upload"
  ),
  createdAt: 30,
  updatedAt: 30,
  sortOrder: 2
};

function createRepository(initialEntries = [entryA]) {
  const entries = initialEntries.map((entry) => ({ ...entry }));

  return {
    entries,
    async getSecurityState() {
      return {
        protectionEnabled: false,
        locked: false,
        autoLockMs: 30 * 60 * 1000
      } satisfies OtpSecurityState;
    },
    async list() {
      return [...entries].sort((left, right) => left.sortOrder - right.sortOrder);
    },
    async save(entry: (typeof entries)[number]) {
      entries.unshift(entry);
      return entry;
    },
    async rename(id: string, serviceName: string) {
      const target = entries.find((entry) => entry.id === id);
      if (target) {
        target.serviceName = serviceName;
      }
    },
    async delete(id: string) {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        entries.splice(index, 1);
      }
    },
    async updateColor(id: string, markerColor: string) {
      const target = entries.find((entry) => entry.id === id);
      if (target) {
        target.markerColor = markerColor;
      }
    },
    async reorder(ids: string[]) {
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      const nextEntries = ids.flatMap((id, index) => {
        const target = byId.get(id);
        if (target) {
          target.sortOrder = index;
          return [target];
        }
        return [];
      });
      entries.splice(0, entries.length, ...nextEntries);
    },
    async deleteAll() {
      entries.splice(0, entries.length);
    },
    async unlock() {
      return {
        protectionEnabled: false,
        locked: false,
        autoLockMs: 30 * 60 * 1000
      } satisfies OtpSecurityState;
    },
    async lock() {
      return {
        protectionEnabled: false,
        locked: false,
        autoLockMs: 30 * 60 * 1000
      } satisfies OtpSecurityState;
    },
    async enableProtection() {
      return {
        protectionEnabled: true,
        locked: true,
        autoLockMs: 30 * 60 * 1000
      } satisfies OtpSecurityState;
    },
    async changePassphrase() {
      return {
        protectionEnabled: true,
        locked: false,
        autoLockMs: 30 * 60 * 1000
      } satisfies OtpSecurityState;
    },
    async disableProtection() {
      return {
        protectionEnabled: false,
        locked: false,
        autoLockMs: 30 * 60 * 1000
      } satisfies OtpSecurityState;
    }
  };
}

function createPreferencesRepository(initialPreferences: Partial<AppPreferences> = {}) {
  let preferences: AppPreferences = {
    clipboardClearSeconds: 0,
    cardDensity: "comfortable",
    ...initialPreferences
  };

  return {
    async get() {
      return preferences;
    },
    async set(next: Partial<AppPreferences>) {
      preferences = {
        ...preferences,
        ...next
      };
      return preferences;
    }
  };
}

describe("popup app", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("copies the current code when an entry row is clicked", async () => {
    const user = userEvent.setup();

    render(<App copyText={writeText} repository={createRepository()} now={() => 0} />);

    await user.click(await screen.findByRole("button", { name: /Example alice@example.com/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("282760");
    });
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("keeps the top action row icon-only in the empty state", async () => {
    render(
      <App
        copyText={writeText}
        preferencesRepository={createPreferencesRepository()}
        repository={{
          async getSecurityState() {
            return {
              protectionEnabled: false,
              locked: false,
              autoLockMs: 30 * 60 * 1000
            };
          },
          async list() {
            return [];
          },
          async save(entry) {
            return entry;
          },
          async rename() {
            return undefined;
          },
          async delete() {
            return undefined;
          },
          async deleteAll() {
            return undefined;
          },
          async unlock() {
            return {
              protectionEnabled: false,
              locked: false,
              autoLockMs: 30 * 60 * 1000
            };
          },
          async lock() {
            return {
              protectionEnabled: false,
              locked: false,
              autoLockMs: 30 * 60 * 1000
            };
          },
          async enableProtection() {
            return {
              protectionEnabled: true,
              locked: true,
              autoLockMs: 30 * 60 * 1000
            };
          },
          async changePassphrase() {
            return {
              protectionEnabled: true,
              locked: false,
              autoLockMs: 30 * 60 * 1000
            };
          },
          async disableProtection() {
            return {
              protectionEnabled: false,
              locked: false,
              autoLockMs: 30 * 60 * 1000
            };
          }
        }}
        now={() => 0}
      />
    );

    expect(screen.getByLabelText("Scan QR code from screen")).toBeInTheDocument();
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    expect(screen.queryByText("Cap")).not.toBeInTheDocument();
    expect(screen.queryByText("Set")).not.toBeInTheDocument();
  });

  it("shows text-only empty state guidance for first import", async () => {
    render(
      <App
        copyText={writeText}
        preferencesRepository={createPreferencesRepository()}
        repository={{
          async getSecurityState() {
            return {
              protectionEnabled: false,
              locked: false,
              autoLockMs: 30 * 60 * 1000
            };
          },
          async list() {
            return [];
          },
          async save(entry) {
            return entry;
          },
          async rename() {
            return undefined;
          },
          async delete() {
            return undefined;
          },
          async deleteAll() {
            return undefined;
          },
          async unlock() {
            return {
              protectionEnabled: false,
              locked: false,
              autoLockMs: 30 * 60 * 1000
            };
          },
          async lock() {
            return {
              protectionEnabled: false,
              locked: false,
              autoLockMs: 30 * 60 * 1000
            };
          },
          async enableProtection() {
            return {
              protectionEnabled: true,
              locked: true,
              autoLockMs: 30 * 60 * 1000
            };
          },
          async changePassphrase() {
            return {
              protectionEnabled: true,
              locked: false,
              autoLockMs: 30 * 60 * 1000
            };
          },
          async disableProtection() {
            return {
              protectionEnabled: false,
              locked: false,
              autoLockMs: 30 * 60 * 1000
            };
          }
        }}
        now={() => 0}
      />
    );

    expect(await screen.findByText("Add your first account")).toBeInTheDocument();
    expect(screen.getByText("Add an account from Settings or scan a QR code on the current page.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Capture QR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Settings" })).not.toBeInTheDocument();
  });

  it("opens the extension options page from the settings button", async () => {
    const user = userEvent.setup();
    const openSettingsPage = vi.fn().mockResolvedValue(undefined);

    render(
      <App
        copyText={writeText}
        closePopup={() => undefined}
        openSettingsPage={openSettingsPage}
        preferencesRepository={createPreferencesRepository()}
        repository={createRepository()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(openSettingsPage).toHaveBeenCalledTimes(1);
  });

  it("renames the service label from a compact dialog", async () => {
    const user = userEvent.setup();

    render(<App copyText={writeText} repository={createRepository()} now={() => 0} />);

    await user.click(await screen.findByRole("button", { name: "More options for Example" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(screen.getByRole("dialog", { name: "Rename" })).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Name" });
    await user.clear(input);
    await user.type(input, "Renamed{enter}");

    expect(await screen.findByText("Renamed")).toBeInTheDocument();
  });

  it("limits the service name to 50 characters when renaming", async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    const longName = "A".repeat(60);

    render(<App copyText={writeText} repository={repository} now={() => 0} />);

    await user.click(await screen.findByRole("button", { name: "More options for Example" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));

    const input = screen.getByRole("textbox", { name: "Name" });
    await user.clear(input);
    await user.type(input, longName);

    expect(input).toHaveValue("A".repeat(50));

    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(repository.entries[0].serviceName).toBe("A".repeat(50));
    });
  });

  it("deletes an entry after compact dialog confirmation", async () => {
    const user = userEvent.setup();

    render(<App copyText={writeText} repository={createRepository()} now={() => 0} />);

    await user.click(await screen.findByRole("button", { name: "More options for Example" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Delete" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Example")).not.toBeInTheDocument();
    });
  });

  it("closes the entry menu when clicking outside of it", async () => {
    const user = userEvent.setup();

    render(<App copyText={writeText} repository={createRepository()} now={() => 0} />);

    await user.click(await screen.findByRole("button", { name: "More options for Example" }));
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();

    await user.click(screen.getByText("Snap OTP"));

    expect(screen.queryByRole("menuitem", { name: "Rename" })).not.toBeInTheDocument();
  });

  it("changes the entry marker color from the manage menu", async () => {
    const user = userEvent.setup();
    const repository = createRepository();

    render(<App copyText={writeText} repository={repository} now={() => 0} />);

    await user.click(await screen.findByRole("button", { name: "More options for Example" }));
    await user.click(screen.getByRole("menuitem", { name: "Change color" }));
    await user.click(screen.getByRole("button", { name: "Teal" }));

    await waitFor(() => {
      expect(repository.entries[0].markerColor).toBe("#0f766e");
    });
    expect(screen.getByLabelText("Example color marker")).toHaveStyle({ background: "#0f766e" });
  });

  it("shows the curated 12-color palette in order and allows selecting white", async () => {
    const user = userEvent.setup();
    const repository = createRepository();

    render(<App copyText={writeText} repository={repository} now={() => 0} />);

    await user.click(await screen.findByRole("button", { name: "More options for Example" }));
    await user.click(screen.getByRole("menuitem", { name: "Change color" }));

    const swatches = screen.getAllByRole("button").filter((button) =>
      [
        "White",
        "Black",
        "Red",
        "Orange",
        "Yellow",
        "Green",
        "Teal",
        "Blue",
        "Purple",
        "Pink",
        "Brown",
        "Slate"
      ].includes(button.getAttribute("aria-label") ?? "")
    );

    expect(swatches.map((button) => button.getAttribute("aria-label"))).toEqual([
      "White",
      "Black",
      "Red",
      "Orange",
      "Yellow",
      "Green",
      "Teal",
      "Blue",
      "Purple",
      "Pink",
      "Brown",
      "Slate"
    ]);

    await user.click(screen.getByRole("button", { name: "White" }));

    await waitFor(() => {
      expect(repository.entries[0].markerColor).toBe("#ffffff");
    });
    expect(screen.getByLabelText("Example color marker")).toHaveStyle({ background: "#ffffff" });
  });

  it("renders a compact split card with the code row below the identity block", async () => {
    render(<App copyText={writeText} repository={createRepository([longEntry])} now={() => 0} />);

    const entryButton = await screen.findByRole("button", {
      name: /Amazon Web Services Production Account infra-admin@snapotp-company-example.com/i
    });
    const entryRow = entryButton.closest(".entry-row")!;

    expect(within(entryButton).getByText("Amazon Web Services Production Account")).toBeInTheDocument();
    expect(within(entryButton).getByText("infra-admin@snapotp-company-example.com")).toBeInTheDocument();
    expect(within(entryRow).getByText("282 760")).toBeInTheDocument();
    expect(within(entryRow).getByText("30s")).toBeInTheDocument();
    expect(entryRow.querySelector(".entry-code-row")).not.toBeNull();
    expect(entryRow.querySelector(".entry-code-meta")).not.toBeNull();
    expect(entryRow.querySelector(".timer-badge")).not.toBeNull();
    expect(entryRow.querySelector(".timer-dot")).not.toBeNull();
    expect(entryRow.querySelector(".timer-badge-calm")).not.toBeNull();
    expect(entryRow.querySelector(".timer-rail")).toBeNull();
  });

  it("switches timer badge urgency as the refresh time gets closer", async () => {
    const { rerender } = render(<App copyText={writeText} repository={createRepository()} now={() => 11_000} />);

    const warningTimer = await screen.findByText("19s");
    expect(warningTimer).toHaveClass("timer", "timer-warning");
    expect(warningTimer.closest(".timer-badge")).toHaveClass("timer-badge-warning");

    rerender(<App copyText={writeText} repository={createRepository()} now={() => 21_000} />);

    const urgentTimer = await screen.findByText("9s");
    expect(urgentTimer).toHaveClass("timer", "timer-urgent");
    expect(urgentTimer.closest(".timer-badge")).toHaveClass("timer-badge-urgent");
  });

  it("persists drag and drop entry order changes", async () => {
    const repository = createRepository([entryA, entryB]);

    render(<App copyText={writeText} repository={repository} now={() => 0} />);

    const exampleCard = (await screen.findByRole("button", { name: /Example alice@example.com/i })).closest("article");
    const otherCard = screen.getByRole("button", { name: /Other bob@example.com/i }).closest("article");

    expect(exampleCard).not.toBeNull();
    expect(otherCard).not.toBeNull();

    fireEvent.dragStart(otherCard!);
    fireEvent.dragOver(exampleCard!);
    fireEvent.drop(exampleCard!);

    await waitFor(() => {
      expect(repository.entries.map((entry) => entry.id)).toEqual([entryB.id, entryA.id]);
    });
  });

  it("shows a dedicated unlock screen while protection is locked", async () => {
    const unlock = vi.fn().mockResolvedValue({
      protectionEnabled: true,
      locked: false,
      autoLockMs: 30 * 60 * 1000
    } satisfies OtpSecurityState);
    const repository = {
      ...createRepository([entryA]),
      async getSecurityState() {
        return {
          protectionEnabled: true,
          locked: true,
          autoLockMs: 30 * 60 * 1000
        } satisfies OtpSecurityState;
      },
      unlock
    };

    render(<App copyText={writeText} repository={repository} now={() => 0} />);

    expect(await screen.findByText("Unlock Snap OTP")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Example alice@example.com/i })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Password"), "secret passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => {
      expect(unlock).toHaveBeenCalledWith("secret passphrase");
    });
  });

  it("clears the clipboard after the configured timeout", async () => {
    render(
      <App
        copyText={writeText}
        now={() => 0}
        preferencesRepository={createPreferencesRepository({
          clipboardClearSeconds: 15
        })}
        repository={createRepository()}
      />
    );

    const entryButton = await screen.findByRole("button", { name: /Example alice@example.com/i });

    vi.useFakeTimers();
    fireEvent.click(entryButton);
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("282760");

    vi.advanceTimersByTime(15_000);
    await Promise.resolve();

    expect(writeText).toHaveBeenLastCalledWith("");
  });
});

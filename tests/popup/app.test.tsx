import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    expect(screen.getByLabelText("Capture screen region")).toBeInTheDocument();
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    expect(screen.queryByText("Cap")).not.toBeInTheDocument();
    expect(screen.queryByText("Set")).not.toBeInTheDocument();
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

    await user.click(await screen.findByRole("button", { name: "Manage Example" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename service" }));
    expect(screen.getByRole("dialog", { name: "Rename service" })).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Service name" });
    await user.clear(input);
    await user.type(input, "Renamed{enter}");

    expect(await screen.findByText("Renamed")).toBeInTheDocument();
  });

  it("deletes an entry after compact dialog confirmation", async () => {
    const user = userEvent.setup();

    render(<App copyText={writeText} repository={createRepository()} now={() => 0} />);

    await user.click(await screen.findByRole("button", { name: "Manage Example" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete entry" }));
    expect(screen.getByRole("dialog", { name: "Delete entry" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Example")).not.toBeInTheDocument();
    });
  });

  it("closes the entry menu when clicking outside of it", async () => {
    const user = userEvent.setup();

    render(<App copyText={writeText} repository={createRepository()} now={() => 0} />);

    await user.click(await screen.findByRole("button", { name: "Manage Example" }));
    expect(screen.getByRole("menuitem", { name: "Rename service" })).toBeInTheDocument();

    await user.click(screen.getByText("Snap OTP"));

    expect(screen.queryByRole("menuitem", { name: "Rename service" })).not.toBeInTheDocument();
  });

  it("changes the entry marker color from the manage menu", async () => {
    const user = userEvent.setup();
    const repository = createRepository();

    render(<App copyText={writeText} repository={repository} now={() => 0} />);

    await user.click(await screen.findByRole("button", { name: "Manage Example" }));
    await user.click(screen.getByRole("menuitem", { name: "Set color" }));
    await user.click(screen.getByRole("button", { name: "Teal" }));

    await waitFor(() => {
      expect(repository.entries[0].markerColor).toBe("#0f766e");
    });
    expect(screen.getByLabelText("Example color marker")).toHaveStyle({ background: "#0f766e" });
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

    expect(await screen.findByText("Unlock your OTP vault")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Example alice@example.com/i })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Passphrase"), "secret passphrase");
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

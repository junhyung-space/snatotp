import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsApp } from "../../src/settings/App";
import { parseOtpUri } from "../../src/shared/otp";
import type { AppPreferences } from "../../src/shared/preferences";
import type { OtpRepository, OtpSecurityState } from "../../src/shared/storage";

const entryA = {
  ...parseOtpUri(
    "otpauth://totp/Test1:user1@test.com?secret=JBSWY3DPEHPK3PXP&issuer=Test1",
    "upload"
  ),
  createdAt: 10,
  updatedAt: 10,
  sortOrder: 0
};

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

function createRepository(overrides: Partial<OtpRepository> = {}): OtpRepository {
  return {
    async list() {
      return [entryA];
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
    async getSecurityState() {
      return {
        protectionEnabled: false,
        locked: false,
        autoLockMs: 30 * 60 * 1000
      } satisfies OtpSecurityState;
    },
    async unlock() {
      return {
        protectionEnabled: true,
        locked: false,
        autoLockMs: 30 * 60 * 1000
      } satisfies OtpSecurityState;
    },
    async lock() {
      return {
        protectionEnabled: true,
        locked: true,
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
    },
    ...overrides
  };
}

describe("settings app", () => {
  it("renders the sidebar sections and switches the main content", async () => {
    const user = userEvent.setup();

    render(
      <SettingsApp
        preferencesRepository={createPreferencesRepository()}
        repository={createRepository()}
      />
    );

    expect(await screen.findByRole("navigation", { name: "Settings sections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByText("Chrome sync storage")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "General settings" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(screen.getByRole("heading", { name: "Import" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Upload" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Protection" }));

    expect(screen.getByRole("heading", { name: "Protection" })).toBeInTheDocument();
    expect(screen.getAllByText("Passphrase protection").length).toBeGreaterThan(0);
    expect(screen.getByRole("list", { name: "Protection settings" })).toBeInTheDocument();
  });

  it("shows an unlock-first screen before rendering settings content", async () => {
    const user = userEvent.setup();
    const unlock = vi.fn().mockResolvedValue({
      protectionEnabled: true,
      locked: false,
      autoLockMs: 30 * 60 * 1000
    } satisfies OtpSecurityState);

    render(
      <SettingsApp
        preferencesRepository={createPreferencesRepository()}
        repository={createRepository({
          async getSecurityState() {
            return {
              protectionEnabled: true,
              locked: true,
              autoLockMs: 30 * 60 * 1000
            } satisfies OtpSecurityState;
          },
          unlock
        })}
      />
    );

    expect(await screen.findByText("Unlock your OTP vault")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Passphrase"), "secret passphrase");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => {
      expect(unlock).toHaveBeenCalledWith("secret passphrase");
    });
    expect(await screen.findByRole("navigation", { name: "Settings sections" })).toBeInTheDocument();
  });

  it("asks for confirmation before deleting all entries", async () => {
    const user = userEvent.setup();
    const deleteAll = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsApp
        preferencesRepository={createPreferencesRepository()}
        repository={createRepository({
          deleteAll
        })}
      />
    );

    await user.click(await screen.findByRole("button", { name: "Delete all entries" }));

    expect(screen.getByRole("dialog", { name: "Delete all entries" })).toBeInTheDocument();
    expect(deleteAll).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Delete all entries" })).not.toBeInTheDocument();
    expect(deleteAll).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete all entries" }));
    await user.click(screen.getByRole("button", { name: "Delete all entries permanently" }));

    await waitFor(() => {
      expect(deleteAll).toHaveBeenCalledTimes(1);
    });
  });
});

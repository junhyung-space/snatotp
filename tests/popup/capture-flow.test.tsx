import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../../src/popup/App";
import { parseOtpUri } from "../../src/shared/otp";

function createRepository() {
  const entries = [] as ReturnType<typeof parseOtpUri>[];

  return {
    repo: {
      async getSecurityState() {
        return {
          protectionEnabled: false,
          locked: false,
          autoLockMs: 30 * 60 * 1000
        };
      },
      async list() {
        return [...entries];
      },
      async save(entry: ReturnType<typeof parseOtpUri>) {
        entries.unshift(entry);
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
    }
  };
}

describe("capture flow", () => {
  it("starts capture through the background flow", async () => {
    const user = userEvent.setup();
    const startCapture = vi.fn().mockResolvedValue(undefined);
    const closePopup = vi.fn();
    const { repo } = createRepository();

    render(<App closePopup={closePopup} startCapture={startCapture} repository={repo} now={() => 0} />);

    await user.click(screen.getByRole("button", { name: "Scan QR code from screen" }));

    expect(startCapture).toHaveBeenCalledTimes(1);
    expect(closePopup).toHaveBeenCalledTimes(1);
  });
});

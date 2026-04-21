import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../../src/popup/App";

describe("capture failure handling", () => {
  it("shows an error and keeps the popup open when capture cannot start", async () => {
    const user = userEvent.setup();
    const closePopup = vi.fn();
    const startCapture = vi.fn().mockRejectedValue(new Error("Capture unavailable on this tab"));

    render(
      <App
        closePopup={closePopup}
        startCapture={startCapture}
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

    await user.click(screen.getByRole("button", { name: "Scan QR code from screen" }));

    expect(closePopup).not.toHaveBeenCalled();
    expect(await screen.findByText("Capture unavailable on this tab")).toBeInTheDocument();
  });
});

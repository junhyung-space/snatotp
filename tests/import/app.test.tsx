import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ImportSection } from "../../src/import/App";
import type { OtpRepository } from "../../src/shared/storage";

describe("import section", () => {
  const otpUrl = "otpauth://totp/Test1:user1@test.com?secret=JBSWY3DPEHPK3PXP&issuer=Test1";

  function createRepository(overrides: Partial<OtpRepository> = {}): OtpRepository {
    return {
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
      async getSecurityState() {
        return {
          protectionEnabled: false,
          locked: false,
          autoLockMs: 30 * 60 * 1000
        };
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
      },
      ...overrides
    };
  }

  it("uses upload as the default registration tab and switches to URL entry", async () => {
    const user = userEvent.setup();
    const { container } = render(<ImportSection repository={createRepository()} />);

    expect(screen.getByText("Import")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add account" })).toBeInTheDocument();
    expect(
      screen.getByText("Upload a QR image or paste an authentication link to add an account without leaving Settings.")
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Upload" })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector(".import-stage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Drop QR image here/i })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Authentication link" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Link" }));

    expect(screen.getByRole("tab", { name: "Link" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: "Authentication link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add account" })).toBeInTheDocument();
  });

  it("shows a local success message after a successful QR upload", async () => {
    const user = userEvent.setup();
    const onImportSaved = vi.fn();
    const decodeUpload = vi.fn().mockResolvedValue(
      "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example"
    );

    render(
      <ImportSection
        decodeUpload={decodeUpload}
        onImportSaved={onImportSaved}
        repository={createRepository()}
      />
    );

    const input = screen.getByLabelText("Select QR image") as HTMLInputElement;
    await user.upload(input, new File(["fake"], "otp.png", { type: "image/png" }));

    expect(await screen.findByText("Added: Example")).toBeInTheDocument();
    expect(onImportSaved).toHaveBeenCalledTimes(1);
  });

  it("shows a duplicate message after an existing QR upload", async () => {
    const user = userEvent.setup();
    const decodeUpload = vi.fn().mockResolvedValue(
      "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example"
    );

    render(
      <ImportSection
        decodeUpload={decodeUpload}
        repository={createRepository({
          async save(entry) {
            return {
              entry,
              status: "duplicate" as const
            };
          }
        })}
      />
    );

    const input = screen.getByLabelText("Select QR image") as HTMLInputElement;
    await user.upload(input, new File(["fake"], "otp.png", { type: "image/png" }));

    expect(await screen.findByText("Already added: Example")).toBeInTheDocument();
  });

  it("clears upload duplicate feedback when the user starts a new upload", async () => {
    const user = userEvent.setup();
    const decodeUpload = vi
      .fn()
      .mockResolvedValueOnce(
        "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example"
      )
      .mockResolvedValueOnce(
        "otpauth://totp/Other:bob@example.com?secret=KRUGS4ZANFZSAYJA&issuer=Other"
      );

    render(
      <ImportSection
        decodeUpload={decodeUpload}
        repository={createRepository({
          async save(entry) {
            if (entry.serviceName === "Example") {
              return {
                entry,
                status: "duplicate" as const
              };
            }

            return entry;
          }
        })}
      />
    );

    const input = screen.getByLabelText("Select QR image") as HTMLInputElement;
    await user.upload(input, new File(["fake"], "otp.png", { type: "image/png" }));
    expect(await screen.findByText("Already added: Example")).toBeInTheDocument();

    await user.upload(input, new File(["fake2"], "otp-2.png", { type: "image/png" }));

    expect(screen.queryByText("Already added: Example")).not.toBeInTheDocument();
    expect(await screen.findByText("Added: Other")).toBeInTheDocument();
  });

  it("shows an upload failure message", async () => {
    const user = userEvent.setup();
    const decodeUpload = vi.fn().mockRejectedValue(new Error("No OTP QR code found"));

    render(<ImportSection decodeUpload={decodeUpload} repository={createRepository()} />);

    const input = screen.getByLabelText("Select QR image") as HTMLInputElement;
    await user.upload(input, new File(["fake"], "not-otp.png", { type: "image/png" }));

    expect(await screen.findByText("No OTP QR code found")).toBeInTheDocument();
  });

  it("saves an OTP entry from a pasted otpauth URL and shows local success feedback", async () => {
    const user = userEvent.setup();
    const save = vi.fn();

    render(
      <ImportSection
        repository={createRepository({
          async save(entry) {
            save(entry);
            return entry;
          }
        })}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Link" }));
    await user.type(screen.getByRole("textbox", { name: "Authentication link" }), otpUrl);
    await user.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    expect(save.mock.calls[0][0]).toMatchObject({
      accountName: "user1@test.com",
      serviceName: "Test1",
      sourceType: "url"
    });
    expect(await screen.findByText("Added: Test1")).toBeInTheDocument();
  });

  it("shows a duplicate message after an existing otpauth URL", async () => {
    const user = userEvent.setup();

    render(
      <ImportSection
        repository={createRepository({
          async save(entry) {
            return {
              entry,
              status: "duplicate" as const
            };
          }
        })}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Link" }));
    await user.type(screen.getByRole("textbox", { name: "Authentication link" }), otpUrl);
    await user.click(screen.getByRole("button", { name: "Add account" }));

    expect(await screen.findByText("Already added: Test1")).toBeInTheDocument();
  });

  it("clears URL validation feedback when the user edits the input", async () => {
    const user = userEvent.setup();

    render(<ImportSection repository={createRepository()} />);

    await user.click(screen.getByRole("tab", { name: "Link" }));
    await user.type(screen.getByRole("textbox", { name: "Authentication link" }), "https://example.com");
    await user.click(screen.getByRole("button", { name: "Add account" }));
    expect(await screen.findByText("Paste a valid authentication link")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Authentication link" }), "x");

    expect(screen.queryByText("Paste a valid authentication link")).not.toBeInTheDocument();
  });
});

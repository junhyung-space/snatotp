import { describe, expect, it } from "vitest";
import { createCaptureStatusToast } from "../../src/content/index";

describe("capture status toast", () => {
  it("renders success feedback as a bottom toast card with a clear title", () => {
    const toast = createCaptureStatusToast("success", "Added: Example");

    expect(toast.id).toBe("snapotp-capture-status");
    expect(toast.style.bottom).toBe("24px");
    expect(toast.style.top).toBe("");
    expect(toast.getAttribute("role")).toBe("status");
    expect(toast.textContent).toContain("Account added");
    expect(toast.textContent).toContain("Added: Example");
  });

  it("renders error feedback as an alert toast card", () => {
    const toast = createCaptureStatusToast("error", "QR code not detected");

    expect(toast.getAttribute("role")).toBe("alert");
    expect(toast.textContent).toContain("Capture failed");
    expect(toast.textContent).toContain("QR code not detected");
  });
});

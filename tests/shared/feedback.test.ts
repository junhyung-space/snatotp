import { describe, expect, it } from "vitest";
import {
  createAddedMessage,
  createDuplicateMessage,
  createErrorMessage
} from "../../src/shared/feedback";

describe("feedback helpers", () => {
  it("creates aligned success and duplicate messages", () => {
    expect(createAddedMessage("Example")).toEqual({
      kind: "success",
      text: "Added: Example"
    });
    expect(createDuplicateMessage("Example")).toEqual({
      kind: "warning",
      text: "Already added: Example"
    });
  });

  it("extracts an error message with fallback support", () => {
    expect(createErrorMessage(new Error("No OTP QR code found"), "Import failed")).toEqual({
      kind: "error",
      text: "No OTP QR code found"
    });
    expect(createErrorMessage("unknown", "Import failed")).toEqual({
      kind: "error",
      text: "Import failed"
    });
  });
});

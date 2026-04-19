import { describe, expect, it } from "vitest";
import { generateOtpCode, getSecondsRemaining, parseOtpUri } from "../../src/shared/otp";

describe("otp helpers", () => {
  it("parses a standard otpauth URI and derives visible fields", () => {
    const entry = parseOtpUri(
      "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example",
      "upload"
    );

    expect(entry.serviceName).toBe("Example");
    expect(entry.accountName).toBe("alice@example.com");
    expect(entry.issuer).toBe("Example");
    expect(entry.sourceType).toBe("upload");
    expect(entry.period).toBe(30);
  });

  it("generates the expected TOTP at a known timestamp", () => {
    const entry = parseOtpUri(
      "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example",
      "upload"
    );

    expect(generateOtpCode(entry, 0)).toBe("282760");
    expect(getSecondsRemaining(entry, 29_000)).toBe(1);
    expect(getSecondsRemaining(entry, 30_000)).toBe(30);
  });
});

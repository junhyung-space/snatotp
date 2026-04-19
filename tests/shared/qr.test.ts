import { describe, expect, it } from "vitest";
import { decodeOtpUriFromImageData, scanImageData } from "../../src/shared/qr";

describe("qr helpers", () => {
  it("returns an otpauth URI from decoded image data", async () => {
    const imageData = {
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1
    } as ImageData;
    const result = await decodeOtpUriFromImageData(imageData, () => ({
      data: "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example"
    }));

    expect(result).toContain("otpauth://totp/");
  });

  it("rejects non-otp QR payloads", async () => {
    const imageData = {
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1
    } as ImageData;

    await expect(
      decodeOtpUriFromImageData(imageData, () => ({
        data: "https://example.com"
      }))
    ).rejects.toThrow(/not a valid otp/i);
  });

  it("throws a 'not detected' error when jsQR finds no QR code", async () => {
    const imageData = {
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1
    } as ImageData;

    await expect(
      decodeOtpUriFromImageData(imageData, () => null)
    ).rejects.toThrow(/not detected/i);
  });

  it("scanImageData returns null when decoder finds nothing", () => {
    const imageData = {
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1
    } as ImageData;

    expect(scanImageData(imageData, () => null)).toBeNull();
  });

  it("scanImageData returns the decoded string on success", () => {
    const imageData = {
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1
    } as ImageData;

    expect(
      scanImageData(imageData, () => ({ data: "otpauth://totp/test" }))
    ).toBe("otpauth://totp/test");
  });
});

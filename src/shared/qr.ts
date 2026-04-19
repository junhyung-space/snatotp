import jsQR from "jsqr";

type QrDecodeResult = { data: string } | null;
type QrDecoder = (data: Uint8ClampedArray, width: number, height: number) => QrDecodeResult;

export function scanImageData(imageData: ImageData, decoder: QrDecoder = jsQR): string | null {
  return decoder(imageData.data, imageData.width, imageData.height)?.data ?? null;
}

export async function decodeOtpUriFromImageData(
  imageData: ImageData,
  decoder: QrDecoder = jsQR
) {
  const data = scanImageData(imageData, decoder);

  if (data === null) {
    throw new Error("QR code not detected. Try selecting a slightly larger area.");
  }

  if (!data.startsWith("otpauth://")) {
    throw new Error("QR payload is not a valid OTP URI");
  }

  return data;
}

export async function decodeOtpUriFromFile(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context is unavailable");
  }

  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return decodeOtpUriFromImageData(imageData);
}

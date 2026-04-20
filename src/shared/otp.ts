import * as OTPAuth from "otpauth";
import type { OtpEntry, SourceType } from "./types";

export const MARKER_COLOR_OPTIONS = [
  { label: "White", value: "#ffffff" },
  { label: "Black", value: "#000000" },
  { label: "Red", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Yellow", value: "#eab308" },
  { label: "Green", value: "#22c55e" },
  { label: "Teal", value: "#0f766e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Purple", value: "#8b5cf6" },
  { label: "Pink", value: "#ec4899" },
  { label: "Brown", value: "#8b5e3c" },
  { label: "Slate", value: "#64748b" }
] as const;

export const MARKER_COLORS = MARKER_COLOR_OPTIONS.map((option) => option.value);

function createStableId(secret: string, issuer: string, accountName: string) {
  return `${secret}:${issuer}:${accountName}`.toLowerCase();
}

export function getDefaultMarkerColor(value: string) {
  const hash = [...value].reduce((total, character) => total + character.charCodeAt(0), 0);
  return MARKER_COLORS[hash % MARKER_COLORS.length];
}

export function parseOtpUri(uri: string, sourceType: SourceType): OtpEntry {
  const parsed = OTPAuth.URI.parse(uri);

  if (!(parsed instanceof OTPAuth.TOTP)) {
    throw new Error("Only TOTP URIs are supported");
  }

  const now = Date.now();
  const issuer = parsed.issuer ?? "";
  const label = parsed.label;
  const accountName = label.includes(":") ? label.split(":").slice(1).join(":") : label;
  const serviceName = issuer || (label.includes(":") ? label.split(":")[0] : label) || "Unknown";
  const secret = parsed.secret.base32;
  const id = createStableId(secret, issuer, accountName);

  return {
    id,
    serviceName,
    accountName,
    secret,
    issuer,
    digits: parsed.digits,
    period: parsed.period,
    algorithm: parsed.algorithm,
    markerColor: getDefaultMarkerColor(id),
    sortOrder: now,
    createdAt: now,
    updatedAt: now,
    sourceType
  };
}

export function generateOtpCode(entry: OtpEntry, now: number) {
  const totp = new OTPAuth.TOTP({
    issuer: entry.issuer,
    label: entry.accountName,
    algorithm: entry.algorithm as OTPAuth.Algorithm,
    digits: entry.digits,
    period: entry.period,
    secret: entry.secret
  });

  return totp.generate({ timestamp: now });
}

export function formatOtpCode(code: string) {
  const mid = Math.ceil(code.length / 2);
  return `${code.slice(0, mid)} ${code.slice(mid)}`;
}

export function getSecondsRemaining(entry: OtpEntry, now: number) {
  const elapsedSeconds = Math.floor(now / 1000);
  const remainder = elapsedSeconds % entry.period;
  return remainder === 0 ? entry.period : entry.period - remainder;
}

import type { OtpEntry } from "./types";

export const SECURITY_METADATA_KEY = "security";
export const SECURITY_SESSION_KEY = "security-session";
export const SECURITY_VERSION = 1;
export const PBKDF2_ITERATIONS = 250_000;
export const AUTOLOCK_MS = 30 * 60 * 1000;

export type SecurityMetadata = {
  version: typeof SECURITY_VERSION;
  enabled: true;
  salt: string;
  iterations: number;
  verifierHash: string;
};

export type SecuritySessionState = {
  keyMaterial: string;
  unlockedAt: number;
  expiresAt: number;
};

export type EncryptedPayload = {
  iv: string;
  ciphertext: string;
};

function toBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

function fromBase64(value: string) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function concatBytes(left: Uint8Array, right: Uint8Array) {
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}

async function deriveKeyMaterialBytes(passphrase: string, saltBytes: Uint8Array, iterations: number) {
  const subtle = crypto.subtle;
  const encoder = new TextEncoder();
  const baseKey = await subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, [
    "deriveBits"
  ]);
  const derivedBits = await subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations
    },
    baseKey,
    256
  );

  return new Uint8Array(derivedBits);
}

async function hashBytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

async function importAesKey(keyMaterialBase64: string) {
  return crypto.subtle.importKey("raw", fromBase64(keyMaterialBase64), "AES-GCM", false, [
    "encrypt",
    "decrypt"
  ]);
}

function isSecurityMetadata(value: unknown): value is SecurityMetadata {
  return Boolean(
    value &&
      typeof value === "object" &&
      "version" in value &&
      "enabled" in value &&
      "salt" in value &&
      "iterations" in value &&
      "verifierHash" in value
  );
}

export function parseSecurityMetadata(value: unknown) {
  return isSecurityMetadata(value) ? value : null;
}

export function parseSecuritySession(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "keyMaterial" in value &&
    "unlockedAt" in value &&
    "expiresAt" in value &&
    typeof value.keyMaterial === "string" &&
    typeof value.unlockedAt === "number" &&
    typeof value.expiresAt === "number"
  ) {
    return value as SecuritySessionState;
  }

  return null;
}

export function isSessionExpired(session: SecuritySessionState, now = Date.now()) {
  return session.expiresAt <= now;
}

export function createSecuritySession(keyMaterial: string, now = Date.now()): SecuritySessionState {
  return {
    keyMaterial,
    unlockedAt: now,
    expiresAt: now + AUTOLOCK_MS
  };
}

export async function createSecurityMetadata(passphrase: string) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterialBytes = await deriveKeyMaterialBytes(passphrase, saltBytes, PBKDF2_ITERATIONS);
  const verifierHash = await hashBytes(keyMaterialBytes);

  return {
    metadata: {
      version: SECURITY_VERSION,
      enabled: true,
      salt: toBase64(saltBytes),
      iterations: PBKDF2_ITERATIONS,
      verifierHash: toBase64(verifierHash)
    } satisfies SecurityMetadata,
    keyMaterial: toBase64(keyMaterialBytes)
  };
}

export async function verifyPassphrase(passphrase: string, metadata: SecurityMetadata) {
  const keyMaterialBytes = await deriveKeyMaterialBytes(
    passphrase,
    fromBase64(metadata.salt),
    metadata.iterations
  );
  const verifierHash = await hashBytes(keyMaterialBytes);
  const keyMaterial = toBase64(keyMaterialBytes);

  if (toBase64(verifierHash) !== metadata.verifierHash) {
    return null;
  }

  return keyMaterial;
}

export async function encryptEntryPayload(entry: OtpEntry, keyMaterial: string): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await importAesKey(keyMaterial);
  const plaintext = new TextEncoder().encode(JSON.stringify(entry));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintext);

  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptEntryPayload(payload: EncryptedPayload, keyMaterial: string): Promise<OtpEntry> {
  const aesKey = await importAesKey(keyMaterial);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(payload.iv) },
    aesKey,
    fromBase64(payload.ciphertext)
  );
  const decoded = new TextDecoder().decode(decrypted);

  return JSON.parse(decoded) as OtpEntry;
}

export async function createVerifierPayload(keyMaterial: string) {
  const probe = new TextEncoder().encode("snapotp-verifier");
  const aesKey = await importAesKey(keyMaterial);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, probe);

  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptVerifierPayload(payload: EncryptedPayload, keyMaterial: string) {
  const aesKey = await importAesKey(keyMaterial);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(payload.iv) },
    aesKey,
    fromBase64(payload.ciphertext)
  );

  return new TextDecoder().decode(decrypted) === "snapotp-verifier";
}

export function makeEncryptedPayload(iv: Uint8Array, ciphertext: Uint8Array): EncryptedPayload {
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext)
  };
}

export function combinePayloadBytes(iv: string, ciphertext: string) {
  return concatBytes(fromBase64(iv), fromBase64(ciphertext));
}

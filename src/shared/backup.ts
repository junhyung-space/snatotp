import {
  normalizeAppPreferences,
  type AppPreferences,
  type AppPreferencesRepository
} from "./preferences";
import type { OtpEntry } from "./types";
import type { OtpRepository } from "./storage";

export type SnapOtpBackupV1 = {
  version: 1;
  exportedAt: string;
  entries: OtpEntry[];
  preferences: AppPreferences;
};

export type RestoreBackupResult = {
  addedCount: number;
  duplicateCount: number;
};

function isOtpEntry(value: unknown): value is OtpEntry {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "serviceName" in value &&
      "accountName" in value &&
      "secret" in value &&
      "issuer" in value &&
      "digits" in value &&
      "period" in value &&
      "algorithm" in value &&
      "markerColor" in value &&
      "sortOrder" in value &&
      "createdAt" in value &&
      "updatedAt" in value &&
      "sourceType" in value
  );
}

function parseBackup(input: string | SnapOtpBackupV1): SnapOtpBackupV1 {
  const parsed = typeof input === "string" ? JSON.parse(input) : input;

  if (!parsed || typeof parsed !== "object" || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error("Backup file is invalid");
  }

  if (!parsed.entries.every((entry) => isOtpEntry(entry))) {
    throw new Error("Backup file is invalid");
  }

  return {
    version: 1,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
    entries: parsed.entries,
    preferences: normalizeAppPreferences(parsed.preferences)
  };
}

async function assertUnlocked(repository: OtpRepository, action: "export backups" | "restore backups") {
  const securityState = await repository.getSecurityState();

  if (securityState.protectionEnabled && securityState.locked) {
    throw new Error(`Unlock Snap OTP to ${action}`);
  }
}

export async function exportBackup({
  repository,
  preferencesRepository,
  now = () => new Date().toISOString()
}: {
  repository: OtpRepository;
  preferencesRepository: AppPreferencesRepository;
  now?: () => string;
}): Promise<SnapOtpBackupV1> {
  await assertUnlocked(repository, "export backups");
  const [entries, preferences] = await Promise.all([repository.list(), preferencesRepository.get()]);

  return {
    version: 1,
    exportedAt: now(),
    entries,
    preferences
  };
}

export async function restoreBackup(
  input: string | SnapOtpBackupV1,
  {
    repository,
    preferencesRepository
  }: {
    repository: OtpRepository;
    preferencesRepository: AppPreferencesRepository;
  }
): Promise<RestoreBackupResult> {
  await assertUnlocked(repository, "restore backups");
  const backup = parseBackup(input);
  let addedCount = 0;
  let duplicateCount = 0;

  for (const entry of backup.entries) {
    const result = await repository.save(entry);

    if (typeof result === "object" && result !== null && "status" in result && result.status === "duplicate") {
      duplicateCount += 1;
      continue;
    }

    addedCount += 1;
  }

  await preferencesRepository.set(backup.preferences);

  return {
    addedCount,
    duplicateCount
  };
}

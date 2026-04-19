import { beforeEach, describe, expect, it } from "vitest";
import { exportBackup, restoreBackup } from "../../src/shared/backup";
import { parseOtpUri } from "../../src/shared/otp";
import { createAppPreferencesRepository } from "../../src/shared/preferences";
import { createOtpRepository } from "../../src/shared/storage";

type StoredShape = Record<string, unknown>;

function createFakeStorage() {
  let state: StoredShape = {};

  return {
    area: {
      async get(key: string) {
        return { [key]: state[key as keyof StoredShape] };
      },
      async set(next: StoredShape) {
        state = { ...state, ...next };
      },
      async remove(key: string | string[]) {
        const keys = Array.isArray(key) ? key : [key];
        for (const item of keys) {
          delete state[item];
        }
      }
    },
    read() {
      return state;
    }
  };
}

const entryA = {
  ...parseOtpUri(
    "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example",
    "upload"
  ),
  createdAt: 10,
  updatedAt: 10,
  sortOrder: 0
};

const entryB = {
  ...parseOtpUri(
    "otpauth://totp/Other:bob@example.com?secret=KRUGS4ZANFZSAYJA&issuer=Other",
    "url"
  ),
  createdAt: 20,
  updatedAt: 20,
  sortOrder: 1
};

describe("backup service", () => {
  let sync = createFakeStorage();
  let session = createFakeStorage();

  beforeEach(async () => {
    sync = createFakeStorage();
    session = createFakeStorage();
    await sync.area.set({ entries: [] });
  });

  it("exports entries and app preferences without security metadata", async () => {
    const repository = createOtpRepository(sync.area, { sessionArea: session.area });
    const preferencesRepository = createAppPreferencesRepository(sync.area);

    await repository.save(entryA);
    await preferencesRepository.set({
      clipboardClearSeconds: 30,
      cardDensity: "compact"
    });

    const backup = await exportBackup({
      preferencesRepository,
      repository
    });

    expect(backup.version).toBe(1);
    expect(backup.entries).toHaveLength(1);
    expect(backup.entries[0].id).toBe(entryA.id);
    expect(backup.preferences).toEqual({
      clipboardClearSeconds: 30,
      cardDensity: "compact"
    });
    expect(JSON.stringify(backup)).not.toContain("security");
    expect(JSON.stringify(backup)).not.toContain("passphrase");
  });

  it("restores backups by merging new entries and overwriting preferences", async () => {
    const repository = createOtpRepository(sync.area, { sessionArea: session.area });
    const preferencesRepository = createAppPreferencesRepository(sync.area);

    await repository.save(entryA);
    await preferencesRepository.set({
      clipboardClearSeconds: 30,
      cardDensity: "compact"
    });

    const result = await restoreBackup(
      {
        version: 1,
        exportedAt: "2026-04-19T00:00:00.000Z",
        entries: [entryA, entryB],
        preferences: {
          clipboardClearSeconds: 15,
          cardDensity: "comfortable"
        }
      },
      {
        preferencesRepository,
        repository
      }
    );

    expect(result).toEqual({
      addedCount: 1,
      duplicateCount: 1
    });
    expect((await repository.list()).map((entry) => entry.id)).toEqual([entryB.id, entryA.id]);
    await expect(preferencesRepository.get()).resolves.toEqual({
      clipboardClearSeconds: 15,
      cardDensity: "comfortable"
    });
  });

  it("rejects restore attempts while passphrase protection is locked", async () => {
    const repository = createOtpRepository(sync.area, { sessionArea: session.area });
    const preferencesRepository = createAppPreferencesRepository(sync.area);

    await repository.save(entryA);
    await repository.enableProtection("secret passphrase");

    await expect(
      restoreBackup(
        {
          version: 1,
          exportedAt: "2026-04-19T00:00:00.000Z",
          entries: [entryB],
          preferences: {
            clipboardClearSeconds: 0,
            cardDensity: "comfortable"
          }
        },
        {
          preferencesRepository,
          repository
        }
      )
    ).rejects.toThrow("Unlock Snap OTP to restore backups");
  });
});

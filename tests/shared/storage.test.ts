import { beforeEach, describe, expect, it } from "vitest";
import { SECURITY_METADATA_KEY, SECURITY_SESSION_KEY } from "../../src/shared/security";
import { createOtpRepository } from "../../src/shared/storage";
import { parseOtpUri } from "../../src/shared/otp";

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

describe("otp repository", () => {
  const entryA = parseOtpUri(
    "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example",
    "upload"
  );
  const entryB = parseOtpUri(
    "otpauth://totp/Other:bob@example.com?secret=KRUGS4ZANFZSAYJA&issuer=Other",
    "capture"
  );
  let sync = createFakeStorage();
  let session = createFakeStorage();

  beforeEach(async () => {
    sync = createFakeStorage();
    session = createFakeStorage();
    await sync.area.set({ entries: [] });
  });

  it("deduplicates identical entries and sorts recent entries first", async () => {
    const repo = createOtpRepository(sync.area, { sessionArea: session.area });

    await repo.save({ ...entryA, updatedAt: 10, createdAt: 10 });
    const duplicate = await repo.save({ ...entryA, updatedAt: 20, createdAt: 10 });
    await repo.save({ ...entryB, updatedAt: 30, createdAt: 30 });

    const entries = await repo.list();

    expect(duplicate.status).toBe("duplicate");
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe(entryB.id);
    expect(entries[1].id).toBe(entryA.id);
  });

  it("renames and deletes existing entries", async () => {
    const repo = createOtpRepository(sync.area, { sessionArea: session.area });

    await repo.save({ ...entryA, updatedAt: 10, createdAt: 10 });
    await repo.rename(entryA.id, "Renamed");
    expect((await repo.list())[0].serviceName).toBe("Renamed");

    await repo.delete(entryA.id);
    expect(await repo.list()).toEqual([]);
  });

  it("updates marker colors and persists manual reorder", async () => {
    const repo = createOtpRepository(sync.area, { sessionArea: session.area });

    await repo.save({ ...entryA, updatedAt: 10, createdAt: 10 });
    await repo.save({ ...entryB, updatedAt: 20, createdAt: 20 });

    await repo.updateColor(entryA.id, "#ff5500");
    expect((await repo.list()).find((entry) => entry.id === entryA.id)?.markerColor).toBe("#ff5500");

    await repo.reorder([entryA.id, entryB.id]);
    expect((await repo.list()).map((entry) => entry.id)).toEqual([entryA.id, entryB.id]);
  });

  it("encrypts existing entries when protection is enabled and hides them while locked", async () => {
    const repo = createOtpRepository(sync.area, { sessionArea: session.area, now: () => 1_000 });

    await repo.save({ ...entryA, updatedAt: 10, createdAt: 10 });
    await repo.enableProtection("secret passphrase");

    expect(await repo.getSecurityState()).toEqual({
      protectionEnabled: true,
      locked: true,
      autoLockMs: 30 * 60 * 1000
    });
    expect(await repo.list()).toEqual([]);

    const stored = sync.read();
    expect(stored[SECURITY_METADATA_KEY]).toBeTruthy();
    expect(Array.isArray(stored.entries)).toBe(false);
    expect(JSON.stringify(stored.entries)).not.toContain(entryA.secret);
  });

  it("unlocks encrypted entries with the correct passphrase", async () => {
    const repo = createOtpRepository(sync.area, { sessionArea: session.area, now: () => 5_000 });

    await repo.save({ ...entryA, updatedAt: 10, createdAt: 10 });
    await repo.enableProtection("secret passphrase");

    await expect(repo.unlock("wrong passphrase")).rejects.toThrow("Passphrase is incorrect");
    await repo.unlock("secret passphrase");

    expect(await repo.list()).toHaveLength(1);
    expect((await repo.list())[0].id).toBe(entryA.id);
    expect(session.read()[SECURITY_SESSION_KEY]).toBeTruthy();
  });

  it("changes the passphrase and rejects the previous one", async () => {
    const repo = createOtpRepository(sync.area, { sessionArea: session.area, now: () => 7_000 });

    await repo.save({ ...entryA, updatedAt: 10, createdAt: 10 });
    await repo.enableProtection("secret passphrase");
    await repo.unlock("secret passphrase");
    await repo.changePassphrase("secret passphrase", "new passphrase");
    await repo.lock();

    await expect(repo.unlock("secret passphrase")).rejects.toThrow("Passphrase is incorrect");
    await repo.unlock("new passphrase");

    expect((await repo.list())[0].id).toBe(entryA.id);
  });

  it("restores plain sync records when protection is removed", async () => {
    const repo = createOtpRepository(sync.area, { sessionArea: session.area, now: () => 9_000 });

    await repo.save({ ...entryA, updatedAt: 10, createdAt: 10 });
    await repo.enableProtection("secret passphrase");
    await repo.disableProtection("secret passphrase");

    expect(await repo.getSecurityState()).toEqual({
      protectionEnabled: false,
      locked: false,
      autoLockMs: 30 * 60 * 1000
    });
    expect(Array.isArray(sync.read().entries)).toBe(true);
    expect(sync.read()[SECURITY_METADATA_KEY]).toBeUndefined();
    expect(session.read()[SECURITY_SESSION_KEY]).toBeUndefined();
    expect((await repo.list())[0].secret).toBe(entryA.secret);
  });
});

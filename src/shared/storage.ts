import {
  AUTOLOCK_MS,
  type EncryptedPayload,
  type SecurityMetadata,
  SECURITY_METADATA_KEY,
  SECURITY_SESSION_KEY,
  createSecurityMetadata,
  createSecuritySession,
  decryptEntryPayload,
  encryptEntryPayload,
  isSessionExpired,
  parseSecurityMetadata,
  parseSecuritySession,
  verifyPassphrase
} from "./security";
import type { OtpEntry, SourceType } from "./types";

const STORAGE_KEY = "entries";
const STORAGE_VERSION = 2;

export type StorageAreaLike = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove?(key: string | string[]): Promise<void>;
};

type SessionAreaLike = StorageAreaLike;

type PlainOtpRecord = {
  kind: "plain";
  entry: OtpEntry;
};

type EncryptedOtpRecord = {
  kind: "encrypted";
  id: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  sourceType: SourceType;
  markerColor: string;
  payload: EncryptedPayload;
};

type PersistedOtpRecord = PlainOtpRecord | EncryptedOtpRecord;

type PersistedEntriesEnvelope = {
  version: typeof STORAGE_VERSION;
  records: PersistedOtpRecord[];
};

type RuntimeHooks = {
  notifySessionScheduled?(expiresAt: number): Promise<void> | void;
  notifySessionCleared?(): Promise<void> | void;
};

export type OtpSaveResult = {
  entry: OtpEntry;
  status: "created" | "duplicate";
};

export type OtpSecurityState = {
  protectionEnabled: boolean;
  locked: boolean;
  autoLockMs: number;
};

export type OtpRepository = {
  list(): Promise<OtpEntry[]>;
  save(entry: OtpEntry): Promise<OtpEntry | OtpSaveResult>;
  rename(id: string, serviceName: string): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
  updateColor?(id: string, markerColor: string): Promise<void>;
  reorder?(ids: string[]): Promise<void>;
  getSecurityState(): Promise<OtpSecurityState>;
  unlock(passphrase: string): Promise<OtpSecurityState>;
  lock(): Promise<OtpSecurityState>;
  enableProtection(passphrase: string): Promise<OtpSecurityState>;
  changePassphrase(currentPassphrase: string, nextPassphrase: string): Promise<OtpSecurityState>;
  disableProtection(currentPassphrase: string): Promise<OtpSecurityState>;
};

function createDefaultSecurityState(): OtpSecurityState {
  return {
    protectionEnabled: false,
    locked: false,
    autoLockMs: AUTOLOCK_MS
  };
}

function toPersistedEnvelope(entries: OtpEntry[]): PersistedEntriesEnvelope {
  return {
    version: STORAGE_VERSION,
    records: entries.map((entry) => ({
      kind: "plain",
      entry
    }))
  };
}

function isPersistedEnvelope(value: unknown): value is PersistedEntriesEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      "version" in value &&
      "records" in value &&
      value.version === STORAGE_VERSION &&
      Array.isArray(value.records)
  );
}

function normalizeEnvelope(value: unknown): PersistedEntriesEnvelope {
  if (Array.isArray(value)) {
    return toPersistedEnvelope(value as OtpEntry[]);
  }

  if (isPersistedEnvelope(value)) {
    return value;
  }

  return {
    version: STORAGE_VERSION,
    records: []
  };
}

function sortEntries(entries: OtpEntry[]) {
  return [...entries].sort((left, right) => left.sortOrder - right.sortOrder);
}

async function readEnvelope(area: StorageAreaLike) {
  const result = await area.get(STORAGE_KEY);
  return normalizeEnvelope(result[STORAGE_KEY]);
}

async function writePlainEntries(area: StorageAreaLike, entries: OtpEntry[]) {
  await area.set({ [STORAGE_KEY]: sortEntries(entries) });
}

async function writeEncryptedEnvelope(area: StorageAreaLike, records: PersistedOtpRecord[]) {
  await area.set({
    [STORAGE_KEY]: {
      version: STORAGE_VERSION,
      records
    } satisfies PersistedEntriesEnvelope
  });
}

async function readSecurityMetadata(area: StorageAreaLike) {
  const result = await area.get(SECURITY_METADATA_KEY);
  return parseSecurityMetadata(result[SECURITY_METADATA_KEY]);
}

async function writeSecurityMetadata(area: StorageAreaLike, metadata: SecurityMetadata | null) {
  if (metadata === null) {
    if (typeof area.remove === "function") {
      await area.remove(SECURITY_METADATA_KEY);
      return;
    }

    await area.set({ [SECURITY_METADATA_KEY]: null });
    return;
  }

  await area.set({ [SECURITY_METADATA_KEY]: metadata });
}

async function readSessionState(sessionArea: SessionAreaLike, now = Date.now()) {
  const result = await sessionArea.get(SECURITY_SESSION_KEY);
  const session = parseSecuritySession(result[SECURITY_SESSION_KEY]);

  if (!session || isSessionExpired(session, now)) {
    return null;
  }

  return session;
}

async function clearSessionState(sessionArea: SessionAreaLike, hooks?: RuntimeHooks) {
  if (typeof sessionArea.remove === "function") {
    await sessionArea.remove(SECURITY_SESSION_KEY);
  } else {
    await sessionArea.set({ [SECURITY_SESSION_KEY]: null });
  }

  await hooks?.notifySessionCleared?.();
}

async function setSessionState(
  sessionArea: SessionAreaLike,
  keyMaterial: string,
  now: () => number,
  hooks?: RuntimeHooks
) {
  const session = createSecuritySession(keyMaterial, now());
  await sessionArea.set({
    [SECURITY_SESSION_KEY]: session
  });
  await hooks?.notifySessionScheduled?.(session.expiresAt);
}

function assertPassphrase(passphrase: string, message: string) {
  if (!passphrase) {
    throw new Error(message);
  }
}

async function decryptRecords(records: PersistedOtpRecord[], keyMaterial: string) {
  const entries: OtpEntry[] = [];

  for (const record of records) {
    if (record.kind === "plain") {
      entries.push(record.entry);
      continue;
    }

    const entry = await decryptEntryPayload(record.payload, keyMaterial);
    entries.push(entry);
  }

  return sortEntries(entries);
}

async function encryptEntries(entries: OtpEntry[], keyMaterial: string): Promise<PersistedOtpRecord[]> {
  return Promise.all(
    sortEntries(entries).map(async (entry) => ({
      kind: "encrypted" as const,
      id: entry.id,
      sortOrder: entry.sortOrder,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      sourceType: entry.sourceType,
      markerColor: entry.markerColor,
      payload: await encryptEntryPayload(entry, keyMaterial)
    }))
  );
}

async function getUnlockedKeyMaterial(
  area: StorageAreaLike,
  sessionArea: SessionAreaLike,
  now: () => number
) {
  const metadata = await readSecurityMetadata(area);

  if (!metadata) {
    return {
      metadata: null,
      keyMaterial: null
    };
  }

  const session = await readSessionState(sessionArea, now());
  return {
    metadata,
    keyMaterial: session?.keyMaterial ?? null
  };
}

export function createOtpRepository(
  area: StorageAreaLike,
  options: {
    sessionArea?: SessionAreaLike;
    now?: () => number;
    hooks?: RuntimeHooks;
  } = {}
): OtpRepository {
  const sessionArea = options.sessionArea ?? area;
  const now = options.now ?? (() => Date.now());
  const hooks = options.hooks;

  async function listUnlockedEntries() {
    const envelope = await readEnvelope(area);
    const { metadata, keyMaterial } = await getUnlockedKeyMaterial(area, sessionArea, now);

    if (!metadata) {
      return sortEntries(
        envelope.records.flatMap((record) => (record.kind === "plain" ? [record.entry] : []))
      );
    }

    if (!keyMaterial) {
      return [];
    }

    return decryptRecords(envelope.records, keyMaterial);
  }

  async function requireUnlockedEntries(message: string) {
    const { metadata, keyMaterial } = await getUnlockedKeyMaterial(area, sessionArea, now);

    if (!metadata) {
      const envelope = await readEnvelope(area);
      return sortEntries(
        envelope.records.flatMap((record) => (record.kind === "plain" ? [record.entry] : []))
      );
    }

    if (!keyMaterial) {
      throw new Error(message);
    }

    const envelope = await readEnvelope(area);
    return decryptRecords(envelope.records, keyMaterial);
  }

  async function writeEntriesForCurrentMode(entries: OtpEntry[]) {
    const { metadata, keyMaterial } = await getUnlockedKeyMaterial(area, sessionArea, now);

    if (!metadata) {
      await writePlainEntries(area, entries);
      return;
    }

    if (!keyMaterial) {
      throw new Error("Unlock Snap OTP to continue");
    }

    await writeEncryptedEnvelope(area, await encryptEntries(entries, keyMaterial));
  }

  return {
    async list() {
      return listUnlockedEntries();
    },
    async save(entry: OtpEntry) {
      const entries = await requireUnlockedEntries("Unlock Snap OTP to add entries");
      const duplicate = entries.find((item) => item.id === entry.id);

      if (duplicate) {
        return {
          entry: duplicate,
          status: "duplicate"
        };
      }

      const firstSortOrder = entries.at(0)?.sortOrder ?? 1;
      const nextEntry = {
        ...entry,
        sortOrder: firstSortOrder - 1
      };

      await writeEntriesForCurrentMode([nextEntry, ...entries]);
      return {
        entry: nextEntry,
        status: "created"
      };
    },
    async rename(id: string, serviceName: string) {
      const entries = await requireUnlockedEntries("Unlock Snap OTP to rename entries");
      await writeEntriesForCurrentMode(
        entries.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                serviceName,
                updatedAt: now()
              }
            : entry
        )
      );
    },
    async delete(id: string) {
      const entries = await requireUnlockedEntries("Unlock Snap OTP to delete entries");
      await writeEntriesForCurrentMode(entries.filter((entry) => entry.id !== id));
    },
    async deleteAll() {
      const entries = await requireUnlockedEntries("Unlock Snap OTP to delete entries");
      if (entries.length === 0) {
        return;
      }

      await writeEntriesForCurrentMode([]);
    },
    async updateColor(id: string, markerColor: string) {
      const entries = await requireUnlockedEntries("Unlock Snap OTP to update entries");
      await writeEntriesForCurrentMode(
        entries.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                markerColor,
                updatedAt: now()
              }
            : entry
        )
      );
    },
    async reorder(ids: string[]) {
      const entries = await requireUnlockedEntries("Unlock Snap OTP to reorder entries");
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      const selected = ids.flatMap((id) => {
        const entry = byId.get(id);
        return entry ? [entry] : [];
      });
      const remaining = entries.filter((entry) => !ids.includes(entry.id));
      const reordered = [...selected, ...remaining].map((entry, index) => ({
        ...entry,
        sortOrder: index
      }));

      await writeEntriesForCurrentMode(reordered);
    },
    async getSecurityState() {
      const metadata = await readSecurityMetadata(area);

      if (!metadata) {
        return createDefaultSecurityState();
      }

      const session = await readSessionState(sessionArea, now());
      return {
        protectionEnabled: true,
        locked: !session,
        autoLockMs: AUTOLOCK_MS
      };
    },
    async unlock(passphrase: string) {
      assertPassphrase(passphrase, "Enter your passphrase");
      const metadata = await readSecurityMetadata(area);

      if (!metadata) {
        return createDefaultSecurityState();
      }

      const keyMaterial = await verifyPassphrase(passphrase, metadata);

      if (!keyMaterial) {
        throw new Error("Passphrase is incorrect");
      }

      await setSessionState(sessionArea, keyMaterial, now, hooks);
      return {
        protectionEnabled: true,
        locked: false,
        autoLockMs: AUTOLOCK_MS
      };
    },
    async lock() {
      const metadata = await readSecurityMetadata(area);

      if (!metadata) {
        return createDefaultSecurityState();
      }

      await clearSessionState(sessionArea, hooks);
      return {
        protectionEnabled: true,
        locked: true,
        autoLockMs: AUTOLOCK_MS
      };
    },
    async enableProtection(passphrase: string) {
      assertPassphrase(passphrase, "Choose a passphrase");
      const existingMetadata = await readSecurityMetadata(area);

      if (existingMetadata) {
        throw new Error("Passphrase protection is already enabled");
      }

      const plainEntries = await listUnlockedEntries();
      const { metadata, keyMaterial } = await createSecurityMetadata(passphrase);
      const encryptedRecords = await encryptEntries(plainEntries, keyMaterial);

      await area.set({
        [SECURITY_METADATA_KEY]: metadata,
        [STORAGE_KEY]: {
          version: STORAGE_VERSION,
          records: encryptedRecords
        } satisfies PersistedEntriesEnvelope
      });
      await clearSessionState(sessionArea, hooks);

      return {
        protectionEnabled: true,
        locked: true,
        autoLockMs: AUTOLOCK_MS
      };
    },
    async changePassphrase(currentPassphrase: string, nextPassphrase: string) {
      assertPassphrase(currentPassphrase, "Enter your current passphrase");
      assertPassphrase(nextPassphrase, "Choose a new passphrase");
      const metadata = await readSecurityMetadata(area);

      if (!metadata) {
        throw new Error("Passphrase protection is not enabled");
      }

      const currentKeyMaterial = await verifyPassphrase(currentPassphrase, metadata);

      if (!currentKeyMaterial) {
        throw new Error("Current passphrase is incorrect");
      }

      const envelope = await readEnvelope(area);
      const decryptedEntries = await decryptRecords(envelope.records, currentKeyMaterial);
      const { metadata: nextMetadata, keyMaterial: nextKeyMaterial } = await createSecurityMetadata(nextPassphrase);

      await area.set({
        [SECURITY_METADATA_KEY]: nextMetadata,
        [STORAGE_KEY]: {
          version: STORAGE_VERSION,
          records: await encryptEntries(decryptedEntries, nextKeyMaterial)
        } satisfies PersistedEntriesEnvelope
      });
      await setSessionState(sessionArea, nextKeyMaterial, now, hooks);

      return {
        protectionEnabled: true,
        locked: false,
        autoLockMs: AUTOLOCK_MS
      };
    },
    async disableProtection(currentPassphrase: string) {
      assertPassphrase(currentPassphrase, "Enter your current passphrase");
      const metadata = await readSecurityMetadata(area);

      if (!metadata) {
        return createDefaultSecurityState();
      }

      const keyMaterial = await verifyPassphrase(currentPassphrase, metadata);

      if (!keyMaterial) {
        throw new Error("Current passphrase is incorrect");
      }

      const envelope = await readEnvelope(area);
      const decryptedEntries = await decryptRecords(envelope.records, keyMaterial);
      await writePlainEntries(area, decryptedEntries);
      await writeSecurityMetadata(area, null);
      await clearSessionState(sessionArea, hooks);

      return createDefaultSecurityState();
    }
  };
}

export function createChromeOtpRepository() {
  return createOtpRepository(chrome.storage.sync as unknown as StorageAreaLike, {
    sessionArea: chrome.storage.session as unknown as SessionAreaLike,
    hooks: {
      notifySessionScheduled(expiresAt) {
        return chrome.runtime
          .sendMessage({
            type: "schedule-security-autolock",
            expiresAt
          })
          .catch(() => undefined);
      },
      notifySessionCleared() {
        return chrome.runtime
          .sendMessage({
            type: "clear-security-session"
          })
          .catch(() => undefined);
      }
    }
  });
}

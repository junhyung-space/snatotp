import { StrictMode, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { App as PopupApp } from "../popup/App";
import { SettingsApp } from "../settings/App";
import { createAppPreferencesRepository, type AppPreferences } from "../shared/preferences";
import { parseOtpUri } from "../shared/otp";
import { createOtpRepository, type OtpRepository, type OtpSecurityState, type StorageAreaLike } from "../shared/storage";
import "./styles.css";
import "../popup/styles.css";
import "../settings/styles.css";

function StoreLogo() {
  return (
    <svg className="store-logo" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="88" y="88" width="848" height="848" rx="208" fill="#2F6FED" />
      <circle cx="344" cy="388" r="74" fill="white" />
      <circle cx="512" cy="388" r="74" fill="white" />
      <circle cx="680" cy="388" r="74" fill="white" />
      <circle cx="344" cy="636" r="74" fill="white" />
      <circle cx="512" cy="636" r="74" fill="#CFE0FF" />
      <circle cx="680" cy="636" r="74" fill="white" />
    </svg>
  );
}

function createMemoryArea(initial: Record<string, unknown> = {}): StorageAreaLike {
  const state = { ...initial };

  return {
    async get(key) {
      return {
        [key]: state[key]
      };
    },
    async set(items) {
      Object.assign(state, items);
    },
    async remove(key) {
      const keys = Array.isArray(key) ? key : [key];
      for (const item of keys) {
        delete state[item];
      }
    }
  };
}

function createPreviewRepository(securityState: OtpSecurityState = {
  protectionEnabled: false,
  locked: false,
  autoLockMs: 30 * 60 * 1000
}): OtpRepository {
  const syncArea = createMemoryArea();
  const sessionArea = createMemoryArea();
  const repository = createOtpRepository(syncArea, sessionArea);

  const entries = [
    {
      uri: "otpauth://totp/Notion:design@team.io?secret=JBSWY3DPEHPK3PXP&issuer=Notion",
      markerColor: "#4c7bff"
    },
    {
      uri: "otpauth://totp/GitHub:junhyung-space?secret=KRSXG5DSNFXGOIDBNZSCA43FON2CA5DJN5XW4ZI&issuer=GitHub",
      markerColor: "#16a085"
    },
    {
      uri: "otpauth://totp/Figma:product@snapotp.app?secret=ONSWG4TFOQ======&issuer=Figma",
      markerColor: "#f48b3c"
    }
  ];

  const seeded = entries.map((item, index) => {
    const parsed = parseOtpUri(item.uri, index === 2 ? "capture" : "upload");
    return {
      ...parsed,
      markerColor: item.markerColor,
      sortOrder: index,
      createdAt: 1_711_000_000_000 + index,
      updatedAt: 1_711_000_000_000 + index
    };
  });

  let ready = false;

  const ensureSeeded = async () => {
    if (ready) {
      return;
    }

    for (const entry of seeded) {
      await repository.save(entry);
    }

    ready = true;
  };

  return {
    async list() {
      await ensureSeeded();
      return repository.list();
    },
    async save(entry) {
      await ensureSeeded();
      return repository.save(entry);
    },
    async rename(id, serviceName) {
      await ensureSeeded();
      return repository.rename(id, serviceName);
    },
    async delete(id) {
      await ensureSeeded();
      return repository.delete(id);
    },
    async deleteAll() {
      await ensureSeeded();
      return repository.deleteAll();
    },
    async updateColor(id, markerColor) {
      await ensureSeeded();
      return repository.updateColor?.(id, markerColor);
    },
    async reorder(ids) {
      await ensureSeeded();
      return repository.reorder?.(ids);
    },
    async getSecurityState(): Promise<OtpSecurityState> {
      return securityState;
    },
    async unlock(passphrase) {
      return {
        ...securityState,
        locked: false
      };
    },
    async lock() {
      return {
        ...securityState,
        locked: true
      };
    },
    async enableProtection(passphrase) {
      return {
        protectionEnabled: true,
        locked: true,
        autoLockMs: 30 * 60 * 1000
      };
    },
    async changePassphrase(currentPassphrase, nextPassphrase) {
      return {
        protectionEnabled: true,
        locked: false,
        autoLockMs: 30 * 60 * 1000
      };
    },
    async disableProtection(currentPassphrase) {
      return {
        protectionEnabled: false,
        locked: false,
        autoLockMs: 30 * 60 * 1000
      };
    }
  };
}

async function primePreferences(repository: ReturnType<typeof createAppPreferencesRepository>, next: Partial<AppPreferences>) {
  await repository.set(next);
}

function StorePreview() {
  const search = new URLSearchParams(window.location.search);
  const variant = search.get("variant") ?? "import";

  const variantConfig = useMemo(() => {
    switch (variant) {
      case "popup":
        return {
          headline: "See live codes in one popup.",
          subheadline: "Check current OTPs, copy instantly, and keep your list tidy.",
          stageClassName: "store-stage variant-popup",
          settingsSection: "about" as const,
          popupSecurityState: {
            protectionEnabled: false,
            locked: false,
            autoLockMs: 30 * 60 * 1000
          } satisfies OtpSecurityState,
          settingsSecurityState: {
            protectionEnabled: false,
            locked: false,
            autoLockMs: 30 * 60 * 1000
          } satisfies OtpSecurityState
        };
      case "protection":
        return {
          headline: "Lock saved entries when you want.",
          subheadline: "Turn on optional passphrase protection with auto-lock.",
          stageClassName: "store-stage",
          settingsSection: "protection" as const,
          popupSecurityState: {
            protectionEnabled: true,
            locked: true,
            autoLockMs: 30 * 60 * 1000
          } satisfies OtpSecurityState,
          settingsSecurityState: {
            protectionEnabled: true,
            locked: false,
            autoLockMs: 30 * 60 * 1000
          } satisfies OtpSecurityState
        };
      case "backup":
        return {
          headline: "Back up and restore safely",
          subheadline: "Export JSON backups and merge them back without overwriting duplicates.",
          stageClassName: "store-stage",
          settingsSection: "backup" as const,
          popupSecurityState: {
            protectionEnabled: false,
            locked: false,
            autoLockMs: 30 * 60 * 1000
          } satisfies OtpSecurityState,
          settingsSecurityState: {
            protectionEnabled: false,
            locked: false,
            autoLockMs: 30 * 60 * 1000
          } satisfies OtpSecurityState
        };
      case "import":
      default:
        return {
          headline: "Add accounts from QR or otpauth://",
          subheadline: "Use the settings page to upload, paste, or capture.",
          stageClassName: "store-stage",
          settingsSection: "import" as const,
          popupSecurityState: {
            protectionEnabled: false,
            locked: false,
            autoLockMs: 30 * 60 * 1000
          } satisfies OtpSecurityState,
          settingsSecurityState: {
            protectionEnabled: false,
            locked: false,
            autoLockMs: 30 * 60 * 1000
          } satisfies OtpSecurityState
        };
    }
  }, [variant]);

  const popupRepository = useMemo(() => createPreviewRepository(variantConfig.popupSecurityState), [variantConfig.popupSecurityState]);
  const settingsRepository = useMemo(
    () => createPreviewRepository(variantConfig.settingsSecurityState),
    [variantConfig.settingsSecurityState]
  );
  const popupPreferences = useMemo(() => createAppPreferencesRepository(createMemoryArea()), []);
  const settingsPreferences = useMemo(() => createAppPreferencesRepository(createMemoryArea()), []);

  useEffect(() => {
    void primePreferences(popupPreferences, {
      clipboardClearSeconds: 30,
      cardDensity: "comfortable"
    });
    void primePreferences(settingsPreferences, {
      clipboardClearSeconds: 30,
      cardDensity: "comfortable"
    });
  }, [popupPreferences, settingsPreferences]);

  return (
    <div className="store-shot">
      <section className={variantConfig.stageClassName}>
        <div className="store-left">
          <div className="store-brand">
            <StoreLogo />
            <div className="store-brand-copy">
              <h2>Snap OTP</h2>
            </div>
          </div>

          <div className="store-copy">
            <h1>{variantConfig.headline}</h1>
            <p>{variantConfig.subheadline}</p>
          </div>

          <div className="store-left-visual" aria-hidden="true">
            <div className="store-ghost-card" />
            <div className="store-stack-card">
              <div className="store-stack-header">
                <StoreLogo />
                <span>Snap OTP</span>
              </div>
              <div className="store-stack-list">
                <div className="store-stack-entry">
                  <i style={{ background: "#ff993d" }} />
                  <div>
                    <strong>Google</strong>
                    <span>work@team.io</span>
                  </div>
                  <em>502614</em>
                </div>
                <div className="store-stack-entry">
                  <i style={{ background: "#17a689" }} />
                  <div>
                    <strong>GitHub</strong>
                    <span>junhyung-space</span>
                  </div>
                  <em>831947</em>
                </div>
                <div className="store-stack-entry">
                  <i style={{ background: "#4f80ff" }} />
                  <div>
                    <strong>Slack</strong>
                    <span>ops@snapotp.app</span>
                  </div>
                  <em>274110</em>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="store-settings-shell">
          <SettingsApp
            initialSection={variantConfig.settingsSection}
            preferencesRepository={settingsPreferences}
            repository={settingsRepository}
          />
        </div>

        <div className="store-popup-shell">
          <PopupApp
            closePopup={() => undefined}
            copyText={() => Promise.resolve()}
            openSettingsPage={() => Promise.resolve()}
            preferencesRepository={popupPreferences}
            repository={popupRepository}
            startCapture={() => Promise.resolve()}
          />
        </div>
      </section>
    </div>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Store preview root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <StorePreview />
  </StrictMode>
);
